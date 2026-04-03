import json
import re
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

    def _llm_select_chunk_ids(self, query: str, candidates: list[dict]) -> list[str]:
        candidate_blocks: list[str] = []
        for item in candidates:
            excerpt = str(item.get("text", "")).replace("\n", " ").strip()
            if len(excerpt) > 260:
                excerpt = excerpt[:260] + "..."
            candidate_blocks.append(
                "\n".join(
                    [
                        f"chunk_id: {item.get('chunk_id', '')}",
                        f"title: {item.get('title', 'Untitled')}",
                        f"url: {item.get('source_url', '')}",
                        f"excerpt: {excerpt}",
                    ]
                )
            )

        completion = self.client.chat.completions.create(
            model=self.settings.llm_chat_model,
            temperature=0,
            max_tokens=220,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Select the most relevant chunk_ids for answering the user question. "
                        "Return strict JSON only in this shape: {\"chunk_ids\":[\"id1\",\"id2\"]}. "
                        "Choose at most the requested count and prioritize factual relevance."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Question: {query}\n"
                        f"Max chunk_ids: {self.settings.top_k}\n\n"
                        "Candidates:\n"
                        + "\n\n".join(candidate_blocks)
                    ),
                },
            ],
        )

        raw = (completion.choices[0].message.content or "").strip()
        if not raw:
            return []

        try:
            parsed = json.loads(raw)
            ids = parsed.get("chunk_ids", [])
            return [str(item) for item in ids if str(item).strip()]
        except Exception:
            match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            if not match:
                return []
            try:
                parsed = json.loads(match.group(0))
                ids = parsed.get("chunk_ids", [])
                return [str(item) for item in ids if str(item).strip()]
            except Exception:
                return []

    def retrieve(self, query: str) -> list[dict]:
        rows = self._load_rows()

        if not rows:
            return []

        query_embedding = np.array(self._embed_query(query), dtype="float32")
        query_norm = float(np.linalg.norm(query_embedding))
        if query_norm == 0:
            return []

        scored: list[dict] = []
        for row in rows:
            embedding = row.get("embedding")
            if embedding is None:
                continue
            if embedding.shape[0] != query_embedding.shape[0]:
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

        scored.sort(key=lambda item: item["score"], reverse=True)

        if not scored:
            return []

        candidate_count = min(len(scored), max(self.settings.top_k * 4, 10))
        candidates = scored[:candidate_count]
        selected_ids = self._llm_select_chunk_ids(query, candidates)

        if not selected_ids:
            return candidates[: self.settings.top_k]

        by_id = {item.get("chunk_id", ""): item for item in candidates}
        selected: list[dict] = []
        seen: set[str] = set()
        for chunk_id in selected_ids:
            if chunk_id in by_id and chunk_id not in seen:
                selected.append(by_id[chunk_id])
                seen.add(chunk_id)

        if len(selected) < self.settings.top_k:
            for item in candidates:
                chunk_id = str(item.get("chunk_id", ""))
                if chunk_id in seen:
                    continue
                selected.append(item)
                seen.add(chunk_id)
                if len(selected) >= self.settings.top_k:
                    break

        return selected[: self.settings.top_k]
