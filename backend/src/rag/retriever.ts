import OpenAI from "openai";
import { performance } from "perf_hooks";
import { getSettings } from "../core/config";
import { listChunkEmbeddings } from "../db/repository";
import logger from "../core/logger";

interface CachedRow {
  chunk_id: string;
  source_url: string;
  title: string;
  text: string;
  embedding: Float32Array;
  vector_norm: number;
}

interface RetrievalResult {
  chunk_id: string;
  source_url: string;
  title: string;
  text: string;
  score: number;
}

export class Retriever {
  private client: OpenAI;
  private settings: any;
  private cachedRows: CachedRow[] = [];
  private cacheExpiresAt = 0;
  private cacheTtlSeconds = 45.0;

  constructor() {
    this.settings = getSettings();
    this.client = new OpenAI({
      apiKey: this.settings.getActiveApiKey(),
      baseURL: this.settings.getActiveBaseUrl(),
    });
  }

  private async loadRows(): Promise<CachedRow[]> {
    const now = Date.now() / 1000;
    if (this.cachedRows.length > 0 && now < this.cacheExpiresAt) {
      return this.cachedRows;
    }

    const rawRows = await listChunkEmbeddings();

    const cachedRows: CachedRow[] = [];
    for (const row of rawRows) {
      const embedding = new Float32Array(row.embedding || []);

      if (embedding.length === 0) {
        continue;
      }

      let vectorNorm = row.vectorNorm || 0;
      if (vectorNorm === 0) {
        vectorNorm = this.norm(embedding);
      }
      if (vectorNorm === 0) {
        continue;
      }

      cachedRows.push({
        chunk_id: row.chunkId,
        source_url: row.sourceUrl,
        title: row.title,
        text: row.text,
        embedding,
        vector_norm: vectorNorm,
      });
    }

    this.cachedRows = cachedRows;
    this.cacheExpiresAt = now + this.cacheTtlSeconds;
    return this.cachedRows;
  }

  private norm(vec: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }

  private dotProduct(
    a: Float32Array,
    b: Float32Array
  ): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private async embedQuery(query: string): Promise<number[]> {
    const requestParams: any = {
      model: this.settings.llmEmbeddingModel,
      input: query,
    };

    if (this.settings.llmEmbeddingQueryInputType) {
      requestParams.input_type =
        this.settings.llmEmbeddingQueryInputType;
    }

    const response = await this.client.embeddings.create(requestParams);
    return response.data[0].embedding;
  }

  async retrieveWithTimings(
    query: string
  ): Promise<[RetrievalResult[], Record<string, any>]> {
    const retrievalStart = performance.now();

    const loadStart = performance.now();
    const rows = await this.loadRows();
    const rowCount = rows.length;
    const loadRowsMs = performance.now() - loadStart;

    if (rows.length === 0) {
      return [
        [],
        {
          row_count: 0,
          shape_mismatch_count: 0,
          load_rows_ms: Math.round(loadRowsMs * 100) / 100,
          retrieval_ms: Math.round((performance.now() - retrievalStart) * 100) / 100,
        },
      ];
    }

    const embedStart = performance.now();
    const queryEmbedding = new Float32Array(await this.embedQuery(query));
    const embedQueryMs = performance.now() - embedStart;

    const queryNorm = this.norm(queryEmbedding);
    if (queryNorm === 0) {
      return [
        [],
        {
          load_rows_ms: Math.round(loadRowsMs * 100) / 100,
          embed_query_ms: Math.round(embedQueryMs * 100) / 100,
          retrieval_ms: Math.round((performance.now() - retrievalStart) * 100) / 100,
        },
      ];
    }

    const scoreStart = performance.now();
    const scored: Array<RetrievalResult & { raw_score: number }> = [];
    let shapeMismatchCount = 0;

    for (const row of rows) {
      const embedding = row.embedding;
      if (!embedding) {
        continue;
      }
      if (embedding.length !== queryEmbedding.length) {
        shapeMismatchCount++;
        continue;
      }

      const dotProd = this.dotProduct(embedding, queryEmbedding);
      const score = dotProd / (row.vector_norm * queryNorm);

      scored.push({
        chunk_id: row.chunk_id,
        source_url: row.source_url,
        title: row.title,
        text: row.text,
        score,
        raw_score: dotProd,
      });
    }

    scored.sort((a, b) => b.raw_score - a.raw_score);

    const topK = Math.min(this.settings.topK, scored.length);
    const hits = scored.slice(0, topK).map(({ raw_score, ...rest }) => rest);

    const scoreMs = performance.now() - scoreStart;

    return [
      hits,
      {
        row_count: rowCount,
        shape_mismatch_count: shapeMismatchCount,
        load_rows_ms: Math.round(loadRowsMs * 100) / 100,
        embed_query_ms: Math.round(embedQueryMs * 100) / 100,
        score_ms: Math.round(scoreMs * 100) / 100,
        retrieval_ms: Math.round((performance.now() - retrievalStart) * 100) / 100,
      },
    ];
  }
}
