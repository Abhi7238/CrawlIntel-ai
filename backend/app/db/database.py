from collections.abc import Generator
import logging
from pathlib import Path

from sqlalchemy.exc import OperationalError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def _normalize_database_url(database_url: str) -> str:
    # Render/Supabase examples often use "postgresql://" which defaults to psycopg2.
    # This project uses psycopg (v3), so force that driver when not explicitly provided.
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


database_url = _normalize_database_url(settings.database_url)

engine_kwargs: dict[str, object] = {"future": True}
if database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.db.models import Base

    if database_url.startswith("sqlite"):
        settings.data_dir.mkdir(parents=True, exist_ok=True)

    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError as exc:
        logger.exception("Database initialization failed: %s", exc)
        return
