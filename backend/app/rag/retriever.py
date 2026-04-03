from openai import OpenAI

from app.core.config import Settings
from app.rag.faiss_store import FaissStore


class Retriever:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)
        self.store = FaissStore(
            index_path=settings.index_dir / "index.faiss",
            metadata_path=settings.index_dir / "metadata.jsonl",
        )

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
        query_embedding = self._embed_query(query)
        return self.store.search(query_embedding=query_embedding, top_k=self.settings.top_k)
