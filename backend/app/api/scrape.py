from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.db.database import SessionLocal
from app.db.repository import get_latest_job, upsert_job
from app.core.config import get_settings
from app.models.schemas import ScrapeRequest, ScrapeResponse, StatusResponse
from app.pipeline.chunk_embed import rebuild_faiss_index, save_raw_documents
from app.pipeline.scrape_apify import scrape_urls

router = APIRouter(prefix="/scrape", tags=["scrape"])


def _run_scrape_job(job_id: str, urls: list[str]) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        upsert_job(db, job_id=job_id, status="running", message="Scraping started")

    try:
        documents = scrape_urls(settings=settings, urls=urls)
        total_docs = save_raw_documents(settings, documents)
        build_result = rebuild_faiss_index(settings)

        with SessionLocal() as db:
            upsert_job(
                db,
                job_id=job_id,
                status="completed",
                message="Scrape and indexing completed",
                scraped_documents=total_docs,
                indexed_chunks=build_result.get("chunks", 0),
            )
    except Exception as exc:
        with SessionLocal() as db:
            upsert_job(db, job_id=job_id, status="failed", message=str(exc))


@router.post("", response_model=ScrapeResponse)
def scrape(request: ScrapeRequest, background_tasks: BackgroundTasks) -> ScrapeResponse:
    settings = get_settings()

    if not settings.apify_api_token:
        raise HTTPException(status_code=500, detail="APIFY_API_TOKEN is not configured")
    if not settings.active_api_key:
        raise HTTPException(status_code=500, detail="Active LLM API key is not configured")

    job_id = str(uuid4())
    with SessionLocal() as db:
        upsert_job(db, job_id=job_id, status="queued", message=f"Job {job_id} queued")

    background_tasks.add_task(_run_scrape_job, job_id, request.urls)

    return ScrapeResponse(job_id=job_id, status="queued")


@router.post("/reindex", response_model=StatusResponse)
def reindex() -> StatusResponse:
    settings = get_settings()

    if not settings.active_api_key:
        raise HTTPException(status_code=500, detail="Active LLM API key is not configured")

    try:
        result = rebuild_faiss_index(settings)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reindex failed: {exc}")

    job_id = str(uuid4())
    with SessionLocal() as db:
        upsert_job(
            db,
            job_id=job_id,
            status="completed",
            message="Manual reindex completed",
            scraped_documents=result.get("documents", 0),
            indexed_chunks=result.get("chunks", 0),
        )

    return StatusResponse(
        status="completed",
        message="Manual reindex completed",
        scraped_documents=result.get("documents", 0),
        indexed_chunks=result.get("chunks", 0),
    )


@router.get("/status", response_model=StatusResponse)
def status() -> StatusResponse:
    try:
        with SessionLocal() as db:
            job = get_latest_job(db)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")

    if job is None:
        return StatusResponse(status="idle", message="Ready", scraped_documents=0, indexed_chunks=0)

    return StatusResponse(
        status=job.status,
        message=job.message,
        scraped_documents=job.scraped_documents,
        indexed_chunks=job.indexed_chunks,
    )
