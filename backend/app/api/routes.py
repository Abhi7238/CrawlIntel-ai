from fastapi import APIRouter

from app.api.chat import router as chat_router
from app.api.scrape import router as scrape_router

api_router = APIRouter(prefix="/api")
api_router.include_router(chat_router)
api_router.include_router(scrape_router)
