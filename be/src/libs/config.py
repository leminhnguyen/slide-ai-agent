"""Application configuration via pydantic-settings."""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-5.2"
    openai_embedding_model: str = "text-embedding-3-small"

    # MongoDB
    mongodb_uri: str = "mongodb://root:example@app_mongo:27017/?authSource=admin"
    mongodb_db: str = "slide_agent"

    # Qdrant
    qdrant_url: str = "http://qdrant:6333"

    # Marp CLI
    marp_cli_path: str = "marp"

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:80"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
