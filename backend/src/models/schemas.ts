export interface ChatRequest {
  query: string;
}

export interface SourceItem {
  source_url: string;
  title: string;
  score: number;
}

export interface ChatTimings {
  total_ms?: number;
  retrieval_ms?: number;
  llm_ms?: number;
  llm_answer_ms?: number;
  [key: string]: any;
}

export interface ChatResponse {
  answer: string;
  sources: SourceItem[];
  ui_title?: string | null;
  timings?: ChatTimings | null;
}

export interface ScrapeRequest {
  urls: string[];
}

export interface ManualDocumentItem {
  source_url: string;
  title: string;
  text: string;
}

export interface ManualIngestRequest {
  documents: ManualDocumentItem[];
  reindex?: boolean;
}

export interface ManualIngestResponse {
  status: string;
  message: string;
  saved_documents?: number;
  indexed_chunks?: number;
}

export interface ScrapeResponse {
  job_id: string;
  status: string;
}

export interface StatusResponse {
  status: string;
  message: string;
  scraped_documents?: number;
  indexed_chunks?: number;
}

// Validation helpers
export function validateChatRequest(data: any): ChatRequest {
  if (!data.query || typeof data.query !== "string") {
    throw new Error("query must be a non-empty string");
  }
  if (data.query.length < 2 || data.query.length > 4000) {
    throw new Error("query must be between 2 and 4000 characters");
  }
  return { query: data.query };
}

export function validateScrapeRequest(data: any): ScrapeRequest {
  if (!Array.isArray(data.urls) || data.urls.length === 0) {
    throw new Error("urls must be a non-empty array");
  }
  if (!data.urls.every((url: any) => typeof url === "string")) {
    throw new Error("all urls must be strings");
  }
  return { urls: data.urls };
}

export function validateManualIngestRequest(
  data: any
): ManualIngestRequest {
  if (!Array.isArray(data.documents) || data.documents.length === 0) {
    throw new Error("documents must be a non-empty array");
  }

  for (const doc of data.documents) {
    if (!doc.source_url || typeof doc.source_url !== "string") {
      throw new Error("each document must have a source_url string");
    }
    if (!doc.title || typeof doc.title !== "string") {
      throw new Error("each document must have a title string");
    }
    if (!doc.text || typeof doc.text !== "string" || doc.text.length < 20) {
      throw new Error(
        "each document must have a text string with at least 20 characters"
      );
    }
  }

  return {
    documents: data.documents,
    reindex: data.reindex === true,
  };
}
