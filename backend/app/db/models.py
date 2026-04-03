from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ScrapedDocument(Base):
    __tablename__ = "scraped_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source_url: Mapped[str] = mapped_column(String(2048), index=True)
    title: Mapped[str] = mapped_column(String(512), default="Untitled")
    text: Mapped[str] = mapped_column(Text)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    message: Mapped[str] = mapped_column(String(512))
    scraped_documents: Mapped[int] = mapped_column(Integer, default=0)
    indexed_chunks: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"

    chunk_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_url: Mapped[str] = mapped_column(String(2048), index=True)
    title: Mapped[str] = mapped_column(String(512), default="Untitled")
    text: Mapped[str] = mapped_column(Text)
    # JSON works on both SQLite (local) and Postgres (Supabase) without extension setup.
    embedding: Mapped[list[float]] = mapped_column(JSON)
    vector_norm: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
