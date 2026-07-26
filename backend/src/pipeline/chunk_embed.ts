import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import OpenAI from "openai";
import { getSettings } from "../core/config";
import {
  saveChunkEmbeddingsBatch,
  deleteOldChunkEmbeddings,
} from "../db/repository";
import logger from "../core/logger";

export interface RawDocument {
  source_url: string;
  title: string;
  text: string;
}

export interface ChunkRecord {
  chunk_id: string;
  source_url: string;
  title: string;
  text: string;
}

export interface RebuildResult {
  documents: number;
  chunks: number;
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

export async function saveRawDocuments(
  documents: RawDocument[]
): Promise<number> {
  const settings = getSettings();

  // Ensure directory exists
  if (!fs.existsSync(settings.dataDir)) {
    fs.mkdirSync(settings.dataDir, { recursive: true });
  }

  const filePath = settings.rawDocsFile;

  // Append documents to JSONL file
  for (const doc of documents) {
    fs.appendFileSync(filePath, JSON.stringify(doc) + "\n");
  }

  return documents.length;
}

export async function loadRawDocuments(): Promise<RawDocument[]> {
  const settings = getSettings();
  const filePath = settings.rawDocsFile;

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const documents: RawDocument[] = [];

  for (const line of content.split("\n")) {
    if (line.trim()) {
      try {
        documents.push(JSON.parse(line));
      } catch (e) {
        logger.warn("Failed to parse document line:", line);
      }
    }
  }

  return documents;
}

export function splitText(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const clean = text.split(/\s+/).join(" ");

  if (clean.length <= chunkSize) {
    return [clean];
  }

  const chunks: string[] = [];
  const step = Math.max(chunkSize - chunkOverlap, 1);

  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.substring(start, end));

    if (end === clean.length) {
      break;
    }

    start += step;
  }

  return chunks;
}

export function buildChunkRecords(
  documents: RawDocument[],
  settings: any
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];

  for (const document of documents) {
    const splitChunks = splitText(
      document.text,
      settings.chunkSize,
      settings.chunkOverlap
    );

    for (let idx = 0; idx < splitChunks.length; idx++) {
      const chunkText = splitChunks[idx];
      if (!chunkText.trim()) {
        continue;
      }

      chunks.push({
        chunk_id: hashText(document.source_url + String(idx) + chunkText),
        source_url: document.source_url,
        title: document.title || "Untitled",
        text: chunkText,
      });
    }
  }

  return chunks;
}

export async function embedChunks(
  chunks: ChunkRecord[]
): Promise<number[][]> {
  const settings = getSettings();

  if (!settings.getActiveApiKey()) {
    throw new Error("Missing active LLM API key for selected provider");
  }

  const client = new OpenAI({
    apiKey: settings.getActiveApiKey(),
    baseURL: settings.getActiveBaseUrl(),
  });

  const embeddings: number[][] = [];
  const batchSize = 64;

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const requestParams: any = {
      model: settings.llmEmbeddingModel,
      input: batch.map((item) => item.text),
    };

    if (settings.llmEmbeddingDocumentInputType) {
      requestParams.input_type =
        settings.llmEmbeddingDocumentInputType;
    }

    try {
      const response = await client.embeddings.create(requestParams);
      for (const row of response.data) {
        embeddings.push(row.embedding);
      }
    } catch (error) {
      logger.error("Embedding batch failed:", error);
      throw error;
    }
  }

  return embeddings;
}

export async function rebuildFaissIndex(): Promise<RebuildResult> {
  const settings = getSettings();

  try {
    const documents = await loadRawDocuments();
    if (documents.length === 0) {
      return { documents: 0, chunks: 0 };
    }

    const chunks = buildChunkRecords(documents, settings);
    if (chunks.length === 0) {
      return { documents: documents.length, chunks: 0 };
    }

    logger.info(`Embedding ${chunks.length} chunks...`);
    const vectors = await embedChunks(chunks);

    // Clear old embeddings
    await deleteOldChunkEmbeddings();

    // Save new embeddings
    const chunkEmbeddings = chunks.map((chunk, idx) => ({
      chunkId: chunk.chunk_id,
      sourceUrl: chunk.source_url,
      title: chunk.title,
      text: chunk.text,
      embedding: vectors[idx],
      vectorNorm: 0, // Will be computed on retrieval
    }));

    await saveChunkEmbeddingsBatch(chunkEmbeddings);

    return { documents: documents.length, chunks: chunks.length };
  } catch (error) {
    logger.error("Failed to rebuild index:", error);
    throw error;
  }
}
