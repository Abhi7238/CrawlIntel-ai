import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  ScrapeRequest,
  ManualIngestRequest,
  validateScrapeRequest,
  validateManualIngestRequest,
} from "../models/schemas";
import { scrapeUrls } from "../pipeline/scrape_apify";
import {
  saveRawDocuments,
  rebuildFaissIndex,
} from "../pipeline/chunk_embed";
import { upsertJob, getLatestJob } from "../db/repository";
import { getSettings } from "../core/config";
import logger from "../core/logger";

export const scrapeRouter = Router();

const STALE_JOB_TIMEOUT = 15 * 60 * 1000; // 15 minutes

async function runScrapeJob(jobId: string, urls: string[]): Promise<void> {
  const settings = getSettings();

  try {
    await upsertJob(jobId, "running", "Scraping started");

    const documents = await scrapeUrls(urls);
    const totalDocs = await saveRawDocuments(documents);

    logger.info(`Scraped ${totalDocs} documents`);

    const buildResult = await rebuildFaissIndex();

    await upsertJob(
      jobId,
      "completed",
      "Scrape and indexing completed",
      totalDocs,
      buildResult.chunks
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Scrape job ${jobId} failed:`, error);
    await upsertJob(jobId, "failed", message);
  }
}

scrapeRouter.post("", async (req: Request, res: Response) => {
  try {
    const validated = validateScrapeRequest(req.body);
    const settings = getSettings();

    if (!settings.apifyApiToken) {
      return res
        .status(500)
        .json({ detail: "APIFY_API_TOKEN is not configured" });
    }
    if (!settings.getActiveApiKey()) {
      return res
        .status(500)
        .json({ detail: "Active LLM API key is not configured" });
    }

    const jobId = uuidv4();
    await upsertJob(jobId, "queued", `Job ${jobId} queued`);

    // Run scrape job in background
    runScrapeJob(jobId, validated.urls).catch((error) => {
      logger.error(`Background scrape job failed:`, error);
    });

    res.json({ job_id: jobId, status: "queued" });
  } catch (error) {
    logger.error("Scrape request validation failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ detail: message });
  }
});

scrapeRouter.post("/manual", async (req: Request, res: Response) => {
  try {
    const validated = validateManualIngestRequest(req.body);
    const settings = getSettings();

    const documents = validated.documents.map((item) => ({
      source_url: item.source_url,
      title: item.title,
      text: item.text,
    }));

    const saved = await saveRawDocuments(documents);

    let indexed = 0;
    let status = "completed";
    let message = `Saved ${saved} document(s)`;

    if (validated.reindex) {
      if (!settings.getActiveApiKey()) {
        return res
          .status(500)
          .json({ detail: "Active LLM API key is not configured" });
      }

      try {
        const buildResult = await rebuildFaissIndex();
        indexed = buildResult.chunks;
        message = `Saved ${saved} document(s), indexed ${indexed} chunk(s)`;
      } catch (error) {
        status = "error";
        message = `Saved but indexing failed: ${error}`;
        logger.error("Reindexing failed:", error);
      }
    }

    res.json({
      status,
      message,
      saved_documents: saved,
      indexed_chunks: indexed,
    });
  } catch (error) {
    logger.error("Manual ingest request failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ detail: message });
  }
});

scrapeRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const job = await getLatestJob();

    if (!job) {
      return res.json({
        status: "idle",
        message: "No scrape job has been started yet",
        scraped_documents: 0,
        indexed_chunks: 0,
      });
    }

    // Check if job is stale
    const updatedAt = job.updatedAt || new Date();
    const isStale = Date.now() - updatedAt.getTime() > STALE_JOB_TIMEOUT;

    if (isStale && job.status === "running") {
      await upsertJob(
        job.jobId,
        "stalled",
        "Job appears to be stalled"
      );
      job.status = "stalled";
    }

    res.json({
      status: job.status,
      message: job.message,
      scraped_documents: job.scrapedDocuments,
      indexed_chunks: job.indexedChunks,
    });
  } catch (error) {
    logger.error("Status request failed:", error);
    res.status(500).json({ detail: "Failed to get status" });
  }
});
