from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Apify QA Bot"
    app_env: str = "development"
    app_port: int = 8000
    cors_origins: str = "http://localhost:5173"
    database_url: str = Field(default="sqlite:///./data/app.db", alias="DATABASE_URL")

    llm_provider: str = "openai"
    llm_base_url: str = Field(default="", alias="LLM_BASE_URL")

    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    nvidia_api_key: str = Field(default="", alias="NVIDIA_API_KEY")

    llm_chat_model: str = Field(default="gpt-4.1-mini", alias="LLM_CHAT_MODEL")
    llm_embedding_model: str = Field(default="text-embedding-3-small", alias="LLM_EMBEDDING_MODEL")
    llm_embedding_query_input_type: str = Field(default="", alias="LLM_EMBEDDING_QUERY_INPUT_TYPE")
    llm_embedding_document_input_type: str = Field(default="", alias="LLM_EMBEDDING_DOCUMENT_INPUT_TYPE")

    apify_api_token: str = Field(default="", alias="APIFY_API_TOKEN")
    apify_actor_id: str = "apify/website-content-crawler"

    chunk_size: int = 900
    chunk_overlap: int = 150
    top_k: int = 5

    data_dir: Path = Path("data")
    raw_docs_file: Path = Path("data/raw_docs.jsonl")
    index_dir: Path = Path("data/index")

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def active_api_key(self) -> str:
        provider = self.llm_provider.strip().lower()
        if provider == "nvidia":
            return self.nvidia_api_key
        return self.openai_api_key

    @property
    def active_base_url(self) -> Optional[str]:
        if self.llm_base_url.strip():
            return self.llm_base_url.strip()

        provider = self.llm_provider.strip().lower()
        if provider == "nvidia":
            # NVIDIA supports OpenAI-compatible chat and embeddings APIs.
            return "https://integrate.api.nvidia.com/v1"
        return None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.index_dir.mkdir(parents=True, exist_ok=True)
    return settings
