import numpy as np
import time
from openai import OpenAI

from app.core.config import Settings
from app.db.database import SessionLocal
from app.db.repository import list_chunk_embeddings


class Retriever:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)
        self._cache_ttl_seconds = 45.0
        self._cached_rows: list[dict] = []
        self._cache_expires_at = 0.0

    def _load_rows(self) -> list[dict]:
        now = time.time()
        if self._cached_rows and now < self._cache_expires_at:
            return self._cached_rows

        with SessionLocal() as db:
            raw_rows = list_chunk_embeddings(db)

        cached_rows: list[dict] = []
        for row in raw_rows:
            embedding = np.array(row.get("embedding", []), dtype="float32")
            if embedding.size == 0:
                continue

            vector_norm = float(row.get("vector_norm", 0.0))
            if vector_norm == 0:
                vector_norm = float(np.linalg.norm(embedding))
            if vector_norm == 0:
                continue

            cached_rows.append(
                {
                    "chunk_id": row.get("chunk_id", ""),
                    "source_url": row.get("source_url", ""),
                    "title": row.get("title", "Untitled"),
                    "text": row.get("text", ""),
                    "embedding": embedding,
                    "vector_norm": vector_norm,
                }
            )

        self._cached_rows = cached_rows
        self._cache_expires_at = now + self._cache_ttl_seconds
        return self._cached_rows

    def _embed_query(self, query: str) -> list[float]:
        request_kwargs = {
            "model": self.settings.llm_embedding_model,
            "input": query,
        }
        if self.settings.llm_embedding_query_input_type.strip():
            request_kwargs["input_type"] = self.settings.llm_embedding_query_input_type.strip()

        response = self.client.embeddings.create(**request_kwargs)
        return response.data[0].embedding



    def retrieve_with_timings(self, query: str) -> tuple[list[dict], dict[str, float]]:
        retrieval_start = time.perf_counter()
        load_start = time.perf_counter()
        rows = self._load_rows()
        row_count = len(rows)
        load_rows_ms = (time.perf_counter() - load_start) * 1000

        if not rows:
            return [], {
                "row_count": 0,
                "shape_mismatch_count": 0,
                "load_rows_ms": round(load_rows_ms, 2),
                "retrieval_ms": round((time.perf_counter() - retrieval_start) * 1000, 2),
            }

        embed_start = time.perf_counter()
        query_embedding = np.array(self._embed_query(query), dtype="float32")
        embed_query_ms = (time.perf_counter() - embed_start) * 1000
        query_norm = float(np.linalg.norm(query_embedding))
        if query_norm == 0:
            return [], {
                "load_rows_ms": round(load_rows_ms, 2),
                "embed_query_ms": round(embed_query_ms, 2),
                "retrieval_ms": round((time.perf_counter() - retrieval_start) * 1000, 2),
            }

        score_start = time.perf_counter()
        scored: list[dict] = []
        shape_mismatch_count = 0
        for row in rows:
            embedding = row.get("embedding")
            if embedding is None:
                continue
            if embedding.shape[0] != query_embedding.shape[0]:
                shape_mismatch_count += 1
                continue

            vector_norm = float(row.get("vector_norm", 0.0))
            if vector_norm == 0:
                continue

            similarity = float(np.dot(query_embedding, embedding) / (query_norm * vector_norm))
            item = {
                "chunk_id": row.get("chunk_id", ""),
                "source_url": row.get("source_url", ""),
                "title": row.get("title", "Untitled"),
                "text": row.get("text", ""),
                "score": similarity,
            }
            scored.append(item)

        score_ms = (time.perf_counter() - score_start) * 1000
        scored.sort(key=lambda item: item["score"], reverse=True)

        if not scored:
            retrieval_ms = (time.perf_counter() - retrieval_start) * 1000
            return [], {
                "row_count": row_count,
                "shape_mismatch_count": shape_mismatch_count,
                "load_rows_ms": round(load_rows_ms, 2),
                "embed_query_ms": round(embed_query_ms, 2),
                "score_ms": round(score_ms, 2),
                "retrieval_ms": round(retrieval_ms, 2),
            }

        top_hits = scored[: self.settings.top_k]
        retrieval_ms = (time.perf_counter() - retrieval_start) * 1000
        return top_hits, {
            "row_count": row_count,
            "shape_mismatch_count": shape_mismatch_count,
            "load_rows_ms": round(load_rows_ms, 2),
            "embed_query_ms": round(embed_query_ms, 2),
            "score_ms": round(score_ms, 2),
            "retrieval_ms": round(retrieval_ms, 2),
        }

    def retrieve(self, query: str) -> list[dict]:
        hits, _ = self.retrieve_with_timings(query)
        return hits
