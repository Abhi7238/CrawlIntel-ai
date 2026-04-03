from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.schemas import ChatRequest, ChatResponse
from app.rag.qa_service import QAService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    settings = get_settings()

    if not settings.active_api_key:
        raise HTTPException(status_code=500, detail="Active LLM API key is not configured")

    try:
        service = QAService(settings=settings)
        result = service.answer(request.query)
        return ChatResponse(**result)
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail="No indexed embeddings found. Run scrape/reindex first.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat request failed: {exc}")
