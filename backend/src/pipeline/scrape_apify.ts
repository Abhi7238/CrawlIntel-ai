import axios from "axios";
import { JSDOM } from "jsdom";
import { URL } from "url";
import { getSettings } from "../core/config";
import logger from "../core/logger";

interface ScrapedItem {
  title?: string;
  pageTitle?: string;
  ogTitle?: string;
  text?: string;
  markdown?: string;
  html?: string;
  url?: string;
  loadedUrl?: string;
  metadata?: Record<string, any>;
}

export interface ScrapedRecord {
  source_url: string;
  title: string;
  text: string;
  scraped_at: string;
}

function titleFromUrl(url: string): string {
  if (!url) {
    return "Source";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname?.replace("www.", "") || "";
    const pathSegment = parsed.pathname
      .split("/")
      .filter((s: string) => s)
      .pop()
      ?.replace(/-/g, " ")
      .replace(/_/g, " ")
      .trim() || "";

    if (pathSegment) {
      return `${host} - ${pathSegment}`;
    }
    if (host) {
      return host;
    }
  } catch (e) {
    logger.warn("Failed to parse URL:", url);
  }

  return "Source";
}

function extractTitle(item: ScrapedItem, url: string): string {
  const candidates = [
    item.title,
    item.pageTitle,
    item.ogTitle,
    item.metadata?.title,
    item.metadata?.["og:title"],
  ];

  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text && text.toLowerCase() !== "untitled") {
      return text;
    }
  }

  if (item.html) {
    try {
      const dom = new JSDOM(String(item.html));
      const titleElement = dom.window.document.querySelector("title");
      if (titleElement?.textContent) {
        const htmlTitle = titleElement.textContent.trim();
        if (htmlTitle && htmlTitle.toLowerCase() !== "untitled") {
          return htmlTitle;
        }
      }
    } catch (e) {
      logger.warn("Failed to extract title from HTML");
    }
  }

  return titleFromUrl(url);
}

function extractText(item: ScrapedItem): string {
  if (item.text) {
    return String(item.text).trim();
  }

  if (item.markdown) {
    return String(item.markdown).trim();
  }

  if (item.html) {
    try {
      const dom = new JSDOM(String(item.html));
      const { document } = dom.window;

      // Remove script, style, noscript tags
      const toRemove = document.querySelectorAll("script, style, noscript");
      toRemove.forEach((el: any) => el.remove());

      const text = document.body?.textContent || "";
      return text
        .split(/\s+/)
        .filter((s: string) => s)
        .join(" ");
    } catch (e) {
      logger.warn("Failed to extract text from HTML");
    }
  }

  return "";
}

export async function scrapeUrls(
  urls: string[]
): Promise<ScrapedRecord[]> {
  const settings = getSettings();

  if (!settings.apifyApiToken) {
    throw new Error("Missing APIFY_API_TOKEN");
  }

  const runInput = {
    startUrls: urls.map((url) => ({ url })),
    maxCrawlDepth: 0,
    maxCrawlPages: urls.length,
  };

  try {
    // Call Apify API to start actor run
    const runResponse = await axios.post(
      `https://api.apify.com/v2/acts/${settings.apifyActorId}/runs?token=${settings.apifyApiToken}`,
      runInput
    );

    const datasetId = runResponse.data?.defaultDatasetId;
    if (!datasetId) {
      logger.warn("No dataset ID returned from Apify");
      return [];
    }

    // Wait for the run to complete
    let runStatus = runResponse.data.status;
    let maxAttempts = 120; // 120 * 5 seconds = 10 minutes
    let attempts = 0;

    while (runStatus === "RUNNING" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statusResponse = await axios.get(
        `https://api.apify.com/v2/runs/${runResponse.data.id}?token=${settings.apifyApiToken}`
      );
      runStatus = statusResponse.data?.status;
      attempts++;
    }

    if (runStatus !== "SUCCEEDED") {
      logger.warn(`Apify run ended with status: ${runStatus}`);
      return [];
    }

    // Fetch dataset items
    const records: ScrapedRecord[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const itemsResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${settings.apifyApiToken}&offset=${offset}&limit=${limit}`
      );

      const items = itemsResponse.data || [];
      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const text = extractText(item as ScrapedItem);
        if (!text) {
          continue;
        }

        const url =
          (item as ScrapedItem).url ||
          (item as ScrapedItem).loadedUrl ||
          "";
        const title = extractTitle(item as ScrapedItem, url);

        records.push({
          source_url: url,
          title,
          text,
          scraped_at: new Date().toISOString(),
        });
      }

      offset += limit;
    }

    return records;
  } catch (error) {
    logger.error("Apify scraping failed:", error);
    throw error;
  }
}
