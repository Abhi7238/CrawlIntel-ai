from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(min_length=2, max_length=4000)


class SourceItem(BaseModel):
    source_url: str
    title: str
    score: float


class ChatTimings(BaseModel):
    total_ms: float = 0
    retrieval_ms: float = 0
    llm_ms: float = 0
    llm_answer_ms: float = 0


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceItem]
    timings: ChatTimings | None = None


class ScrapeRequest(BaseModel):
    urls: list[str] = Field(min_length=1)


class ScrapeResponse(BaseModel):
    job_id: str
    status: str


class StatusResponse(BaseModel):
    status: str
    message: str
    scraped_documents: int = 0
    indexed_chunks: int = 0
