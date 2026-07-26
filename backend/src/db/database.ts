import * as fs from "fs";
import * as path from "path";
import { getSettings } from "../core/config";
import logger from "../core/logger";

export interface Database {
  isInitialized: boolean;
}

const db: Database = {
  isInitialized: false,
};

export async function initDatabase(): Promise<Database> {
  const settings = getSettings();

  // Create data directories
  if (!fs.existsSync(settings.dataDir)) {
    fs.mkdirSync(settings.dataDir, { recursive: true });
  }

  if (!fs.existsSync(settings.indexDir)) {
    fs.mkdirSync(settings.indexDir, { recursive: true });
  }

  // Initialize database files if they don't exist
  const jobsFile = path.join(settings.dataDir, "jobs.jsonl");
  if (!fs.existsSync(jobsFile)) {
    fs.writeFileSync(jobsFile, "");
  }

  const embeddingsFile = path.join(settings.indexDir, "embeddings.jsonl");
  if (!fs.existsSync(embeddingsFile)) {
    fs.writeFileSync(embeddingsFile, "");
  }

  db.isInitialized = true;
  logger.info("Database initialized successfully");

  return db;
}

export function getDataSource(): Database {
  if (!db.isInitialized) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return db;
}
