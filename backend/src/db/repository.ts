import * as fs from "fs";
import * as path from "path";
import { getSettings } from "../core/config";
import {
  ScrapedDocument,
  ScrapeJob,
  ChunkEmbedding,
} from "./models";
import logger from "../core/logger";

const settings = getSettings();
const jobsFile = path.join(settings.dataDir, "jobs.jsonl");
const embeddingsFile = path.join(settings.indexDir, "embeddings.jsonl");

function readJsonlFile<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line)) as T[];
  } catch (error) {
    logger.warn("Failed to read JSONL file:", filePath);
    return [];
  }
}

function writeJsonlFile<T>(filePath: string, items: T[]): void {
  try {
    const lines = items.map((item) => JSON.stringify(item));
    fs.writeFileSync(filePath, lines.join("\n"));
  } catch (error) {
    logger.error("Failed to write JSONL file:", filePath);
    throw error;
  }
}

function appendJsonlFile<T>(filePath: string, item: T): void {
  try {
    fs.appendFileSync(filePath, JSON.stringify(item) + "\n");
  } catch (error) {
    logger.error("Failed to append to JSONL file:", filePath);
    throw error;
  }
}

export async function getLatestJob(): Promise<ScrapeJob | null> {
  const jobs = readJsonlFile<ScrapeJob>(jobsFile);
  if (jobs.length === 0) return null;
  return jobs[jobs.length - 1];
}

export async function upsertJob(
  jobId: string,
  status: string,
  message: string,
  scrapedDocuments: number = 0,
  indexedChunks: number = 0
): Promise<ScrapeJob> {
  const jobs = readJsonlFile<ScrapeJob>(jobsFile);

  let job = jobs.find((j) => j.jobId === jobId);

  if (!job) {
    job = {
      jobId,
      status,
      message,
      scrapedDocuments,
      indexedChunks,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    appendJsonlFile(jobsFile, job);
  } else {
    job.status = status;
    job.message = message;
    job.scrapedDocuments = scrapedDocuments;
    job.indexedChunks = indexedChunks;
    job.updatedAt = new Date();

    // Rebuild file with updated job
    const updatedJobs = jobs.map((j) => (j.jobId === jobId ? job! : j));
    writeJsonlFile(jobsFile, updatedJobs);
  }

  return job;
}

export async function saveScrapedDocument(
  document: Partial<ScrapedDocument>
): Promise<ScrapedDocument> {
  // This is not used in the current flow, but keeping for compatibility
  return document as ScrapedDocument;
}

export async function listChunkEmbeddings(): Promise<ChunkEmbedding[]> {
  return readJsonlFile<ChunkEmbedding>(embeddingsFile);
}

export async function saveChunkEmbedding(
  embedding: Partial<ChunkEmbedding>
): Promise<ChunkEmbedding> {
  appendJsonlFile(embeddingsFile, embedding);
  return embedding as ChunkEmbedding;
}

export async function deleteOldChunkEmbeddings(): Promise<number> {
  const count = readJsonlFile(embeddingsFile).length;
  fs.writeFileSync(embeddingsFile, "");
  return count;
}

export async function saveChunkEmbeddingsBatch(
  embeddings: Partial<ChunkEmbedding>[]
): Promise<ChunkEmbedding[]> {
  for (const embedding of embeddings) {
    appendJsonlFile(embeddingsFile, embedding);
  }
  return embeddings as ChunkEmbedding[];
}
