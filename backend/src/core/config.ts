import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

interface Settings {
  appName: string;
  appEnv: string;
  appPort: number;
  corsOrigins: string[];
  databaseUrl: string;

  llmProvider: string;
  llmBaseUrl: string;

  openaiApiKey: string;
  geminiApiKey: string;
  nvidiaApiKey: string;

  llmChatModel: string;
  llmEmbeddingModel: string;
  llmEmbeddingQueryInputType: string;
  llmEmbeddingDocumentInputType: string;

  apifyApiToken: string;
  apifyActorId: string;

  chunkSize: number;
  chunkOverlap: number;
  topK: number;

  dataDir: string;
  rawDocsFile: string;
  indexDir: string;
}

class Config implements Settings {
  appName = process.env.APP_NAME || "Apify QA Bot";
  appEnv = process.env.APP_ENV || "development";
  appPort = parseInt(process.env.APP_PORT || "8000", 10);
  corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin);

  databaseUrl =
    process.env.DATABASE_URL || "sqlite:///./data/app.db";

  llmProvider = (process.env.LLM_PROVIDER || "openai").trim().toLowerCase();
  llmBaseUrl = (process.env.LLM_BASE_URL || "").trim();

  openaiApiKey = process.env.OPENAI_API_KEY || "";
  geminiApiKey = process.env.GEMINI_API_KEY || "";
  nvidiaApiKey = process.env.NVIDIA_API_KEY || "";

  llmChatModel = process.env.LLM_CHAT_MODEL || "gpt-4-mini";
  llmEmbeddingModel =
    process.env.LLM_EMBEDDING_MODEL || "text-embedding-3-small";
  llmEmbeddingQueryInputType =
    process.env.LLM_EMBEDDING_QUERY_INPUT_TYPE || "";
  llmEmbeddingDocumentInputType =
    process.env.LLM_EMBEDDING_DOCUMENT_INPUT_TYPE || "";

  apifyApiToken = process.env.APIFY_API_TOKEN || "";
  apifyActorId = process.env.APIFY_ACTOR_ID || "apify/website-content-crawler";

  chunkSize = parseInt(process.env.CHUNK_SIZE || "900", 10);
  chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || "150", 10);
  topK = parseInt(process.env.TOP_K || "5", 10);

  dataDir = process.env.DATA_DIR || "data";
  rawDocsFile = process.env.RAW_DOCS_FILE || "data/raw_docs.jsonl";
  indexDir = process.env.INDEX_DIR || "data/index";

  getActiveApiKey(): string {
    if (this.llmProvider === "gemini" || this.llmProvider === "google") {
      return this.geminiApiKey;
    }
    if (this.llmProvider === "nvidia") {
      return this.nvidiaApiKey;
    }
    return this.openaiApiKey;
  }

  getActiveBaseUrl(): string | undefined {
    if (this.llmBaseUrl) {
      return this.llmBaseUrl;
    }

    if (this.llmProvider === "gemini" || this.llmProvider === "google") {
      return "https://generativelanguage.googleapis.com/v1beta/openai/";
    }
    if (this.llmProvider === "nvidia") {
      return "https://integrate.api.nvidia.com/v1";
    }
    return undefined;
  }
}

let configInstance: Config | null = null;

export function getSettings(): Config {
  if (!configInstance) {
    configInstance = new Config();
  }
  return configInstance;
}

export default Config;
