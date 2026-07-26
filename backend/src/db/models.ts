export interface ScrapedDocument {
  id?: number;
  contentHash: string;
  sourceUrl: string;
  title: string;
  text: string;
  scrapedAt: Date;
}

export interface ScrapeJob {
  jobId: string;
  status: string;
  message: string;
  scrapedDocuments: number;
  indexedChunks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChunkEmbedding {
  chunkId: string;
  sourceUrl: string;
  title: string;
  text: string;
  embedding: number[];
  vectorNorm: number;
  updatedAt: Date;
}
