import hashlib
from datetime import datetime
from typing import Optional

import numpy as np
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.db.models import ChunkEmbedding, ScrapeJob, ScrapedDocument


def _hash_document(source_url: str, text: str) -> str:
    return hashlib.sha256(f"{source_url}{text}".encode("utf-8")).hexdigest()


def save_documents(db: Session, documents: list[dict]) -> int:
    inserted = 0
    for document in documents:
        source_url = str(document.get("source_url", ""))
        text = str(document.get("text", ""))
        content_hash = _hash_document(source_url, text)

        exists = db.scalar(select(ScrapedDocument.id).where(ScrapedDocument.content_hash == content_hash))
        if exists is not None:
            continue

        scraped_at = document.get("scraped_at")
        if not isinstance(scraped_at, datetime):
            scraped_at = datetime.utcnow()

        db.add(
            ScrapedDocument(
                content_hash=content_hash,
                source_url=source_url,
                title=str(document.get("title", "Untitled")),
                text=text,
                scraped_at=scraped_at,
            )
        )
        inserted += 1

    db.commit()
    return inserted


def list_documents(db: Session) -> list[dict]:
    rows = db.scalars(select(ScrapedDocument).order_by(ScrapedDocument.scraped_at.asc(), ScrapedDocument.id.asc())).all()
    return [
        {
            "source_url": row.source_url,
            "title": row.title,
            "text": row.text,
            "scraped_at": row.scraped_at.isoformat() if row.scraped_at else "",
        }
        for row in rows
    ]


def upsert_job(
    db: Session,
    *,
    job_id: str,
    status: str,
    message: str,
    scraped_documents: Optional[int] = None,
    indexed_chunks: Optional[int] = None,
) -> ScrapeJob:
    job = db.get(ScrapeJob, job_id)
    if job is None:
        job = ScrapeJob(job_id=job_id, status=status, message=message)
        db.add(job)

    job.status = status
    job.message = message
    if scraped_documents is not None:
        job.scraped_documents = scraped_documents
    if indexed_chunks is not None:
        job.indexed_chunks = indexed_chunks
    job.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(job)
    return job


def get_latest_job(db: Session) -> Optional[ScrapeJob]:
    return db.scalars(select(ScrapeJob).order_by(desc(ScrapeJob.updated_at), desc(ScrapeJob.created_at))).first()


def replace_chunk_embeddings(db: Session, chunks: list[dict], vectors: list[list[float]]) -> int:
    if len(chunks) != len(vectors):
        raise ValueError("Chunk and embedding counts do not match")

    db.execute(delete(ChunkEmbedding))

    now = datetime.utcnow()
    for chunk, vector in zip(chunks, vectors):
        arr = np.array(vector, dtype="float32")
        norm = float(np.linalg.norm(arr))
        db.add(
            ChunkEmbedding(
                chunk_id=str(chunk.get("chunk_id", "")),
                source_url=str(chunk.get("source_url", "")),
                title=str(chunk.get("title", "Untitled")),
                text=str(chunk.get("text", "")),
                embedding=[float(v) for v in arr.tolist()],
                vector_norm=norm,
                updated_at=now,
            )
        )

    db.commit()
    return len(chunks)


def list_chunk_embeddings(db: Session) -> list[dict]:
    rows = db.scalars(select(ChunkEmbedding)).all()
    output: list[dict] = []
    for row in rows:
        output.append(
            {
                "chunk_id": row.chunk_id,
                "source_url": row.source_url,
                "title": row.title,
                "text": row.text,
                "embedding": row.embedding or [],
                "vector_norm": float(row.vector_norm or 0.0),
            }
        )
    return output
