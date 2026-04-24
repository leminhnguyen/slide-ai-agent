"""Qdrant vector operations for RAG."""
import uuid
from typing import List, Dict, Any

from langchain_openai import OpenAIEmbeddings
from loguru import logger
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)

from src.libs.config import get_settings
from src.libs.qdrant import get_qdrant

VECTOR_SIZE = 1536  # text-embedding-3-small


def _collection_name(session_id: str) -> str:
    return f"session_{session_id}"


async def ensure_collection(session_id: str) -> None:
    client = get_qdrant()
    name = _collection_name(session_id)
    existing = [c.name for c in (await client.get_collections()).collections]
    if name not in existing:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        logger.info(f"Created Qdrant collection: {name}")


async def embed_and_store(
    session_id: str, doc_id: str, filename: str, chunks: List[str]
) -> int:
    settings = get_settings()
    embeddings = OpenAIEmbeddings(
        model=settings.openai_embedding_model, api_key=settings.openai_api_key
    )

    await ensure_collection(session_id)
    client = get_qdrant()
    collection = _collection_name(session_id)

    vectors = await embeddings.aembed_documents(chunks)
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": i,
                "text": chunk,
            },
        )
        for i, (vec, chunk) in enumerate(zip(vectors, chunks))
    ]

    await client.upsert(collection_name=collection, points=points)
    logger.info(f"Stored {len(points)} vectors for doc {doc_id}")
    return len(points)


async def search(session_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    return await search_with_filter(session_id, query, top_k=top_k)


async def search_with_filter(
    session_id: str,
    query: str,
    top_k: int = 5,
    doc_ids: List[str] | None = None,
) -> List[Dict[str, Any]]:
    settings = get_settings()
    embeddings = OpenAIEmbeddings(
        model=settings.openai_embedding_model, api_key=settings.openai_api_key
    )

    client = get_qdrant()
    collection = _collection_name(session_id)

    # Check collection exists
    existing = [c.name for c in (await client.get_collections()).collections]
    if collection not in existing:
        return []

    query_vec = await embeddings.aembed_query(query)
    query_filter = None
    if doc_ids:
        query_filter = Filter(
            should=[
                FieldCondition(key="doc_id", match=MatchValue(value=doc_id))
                for doc_id in doc_ids
            ]
        )

    results = await client.query_points(
        collection_name=collection,
        query=query_vec,
        limit=top_k,
        query_filter=query_filter,
    )
    return [
        {
            "text": r.payload["text"],
            "filename": r.payload["filename"],
            "score": r.score,
            "doc_id": r.payload["doc_id"],
        }
        for r in results.points
    ]


async def delete_doc_vectors(session_id: str, doc_id: str) -> None:
    client = get_qdrant()
    collection = _collection_name(session_id)
    await client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
        ),
    )
    logger.info(f"Deleted vectors for doc {doc_id}")
