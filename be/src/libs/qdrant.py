"""Qdrant vector store client."""
from qdrant_client import AsyncQdrantClient
from src.libs.config import get_settings

_client: AsyncQdrantClient | None = None


def get_qdrant() -> AsyncQdrantClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncQdrantClient(url=settings.qdrant_url)
    return _client
