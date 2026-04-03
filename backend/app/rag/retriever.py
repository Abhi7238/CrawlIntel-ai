import numpy as np
from openai import OpenAI

from app.core.config import Settings
from app.db.database import SessionLocal
from app.db.repository import list_chunk_embeddings


class Retriever:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)

    def _embed_query(self, query: str) -> list[float]:
        request_kwargs = {
            "model": self.settings.llm_embedding_model,
            "input": query,
        }
        if self.settings.llm_embedding_query_input_type.strip():
            request_kwargs["input_type"] = self.settings.llm_embedding_query_input_type.strip()

        response = self.client.embeddings.create(**request_kwargs)
        return response.data[0].embedding

    def retrieve(self, query: str) -> list[dict]:
        with SessionLocal() as db:
            rows = list_chunk_embeddings(db)

        if not rows:
            return []

        query_embedding = np.array(self._embed_query(query), dtype="float32")
        query_norm = float(np.linalg.norm(query_embedding))
        if query_norm == 0:
            return []

        scored: list[dict] = []
        for row in rows:
            embedding = np.array(row.get("embedding", []), dtype="float32")
            if embedding.size == 0:
                continue
            if embedding.shape[0] != query_embedding.shape[0]:
                continue

            vector_norm = float(row.get("vector_norm", 0.0))
            if vector_norm == 0:
                vector_norm = float(np.linalg.norm(embedding))
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

        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[: self.settings.top_k]
