from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class JobStatus:
    status: str = "idle"
    message: str = "Ready"
    scraped_documents: int = 0
    indexed_chunks: int = 0
    updated_at: datetime = field(default_factory=datetime.utcnow)


SCRAPE_JOB = JobStatus()
