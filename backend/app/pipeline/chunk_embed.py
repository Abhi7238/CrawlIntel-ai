import hashlib

from openai import OpenAI

from app.core.config import Settings
from app.db.database import SessionLocal
from app.db.repository import list_documents, save_documents
from app.rag.faiss_store import FaissStore


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def save_raw_documents(settings: Settings, documents: list[dict]) -> int:
    with SessionLocal() as db:
        return save_documents(db, documents)


def load_raw_documents(settings: Settings) -> list[dict]:
    with SessionLocal() as db:
        return list_documents(db)


def split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    clean = " ".join(text.split())
    if len(clean) <= chunk_size:
        return [clean]

    chunks: list[str] = []
    start = 0
    step = max(chunk_size - chunk_overlap, 1)

    while start < len(clean):
        end = min(start + chunk_size, len(clean))
        chunks.append(clean[start:end])
        if end == len(clean):
            break
        start += step

    return chunks


def build_chunk_records(documents: list[dict], settings: Settings) -> list[dict]:
    chunks: list[dict] = []

    for document in documents:
        split_chunks = split_text(
            text=document.get("text", ""),
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        for idx, chunk_text in enumerate(split_chunks):
            if not chunk_text.strip():
                continue
            chunks.append(
                {
                    "chunk_id": _hash_text(document.get("source_url", "") + str(idx) + chunk_text),
                    "source_url": document.get("source_url", ""),
                    "title": document.get("title", "Untitled"),
                    "text": chunk_text,
                }
            )

    return chunks


def embed_chunks(chunks: list[dict], settings: Settings) -> list[list[float]]:
    if not settings.active_api_key:
        raise ValueError("Missing active LLM API key for selected provider")

    client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)
    embeddings: list[list[float]] = []

    batch_size = 64
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        request_kwargs = {
            "model": settings.llm_embedding_model,
            "input": [item["text"] for item in batch],
        }
        if settings.llm_embedding_document_input_type.strip():
            request_kwargs["input_type"] = settings.llm_embedding_document_input_type.strip()

        response = client.embeddings.create(**request_kwargs)
        embeddings.extend([row.embedding for row in response.data])

    return embeddings


def rebuild_faiss_index(settings: Settings) -> dict:
    documents = load_raw_documents(settings)
    if not documents:
        return {"documents": 0, "chunks": 0}

    chunks = build_chunk_records(documents, settings)
    if not chunks:
        return {"documents": len(documents), "chunks": 0}

    vectors = embed_chunks(chunks, settings)

    store = FaissStore(
        index_path=settings.index_dir / "index.faiss",
        metadata_path=settings.index_dir / "metadata.jsonl",
    )
    indexed = store.save(embeddings=vectors, metadata=chunks)

    return {"documents": len(documents), "chunks": indexed}
