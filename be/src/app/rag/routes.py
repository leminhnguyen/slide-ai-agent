"""RAG document management routes."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from src.app.rag.file_processor import parse_file
from src.app.rag.qdrant_ops import embed_and_store, delete_doc_vectors
from src.libs.database import get_db

router = APIRouter(prefix="/api/rag", tags=["rag"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


class DocumentOut(BaseModel):
    id: str
    session_id: str
    filename: str
    chunk_count: int
    created_at: datetime


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    # Validate extension
    from pathlib import Path
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    # Parse into chunks
    try:
        chunks = parse_file(file.filename or "file", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not chunks:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file")

    # Persist document metadata
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "session_id": session_id,
        "filename": file.filename,
        "chunk_count": len(chunks),
        "created_at": now,
    }
    result = await db.rag_documents.insert_one(doc)
    doc_id = str(result.inserted_id)

    # Embed and store in Qdrant
    await embed_and_store(session_id, doc_id, file.filename or "", chunks)

    return DocumentOut(
        id=doc_id,
        session_id=session_id,
        filename=file.filename or "",
        chunk_count=len(chunks),
        created_at=now,
    )


@router.get("/documents/{session_id}", response_model=list[DocumentOut])
async def list_documents(session_id: str):
    db = get_db()
    cursor = db.rag_documents.find({"session_id": session_id}).sort("created_at", -1)
    docs = []
    async for doc in cursor:
        docs.append(
            DocumentOut(
                id=str(doc["_id"]),
                session_id=doc["session_id"],
                filename=doc["filename"],
                chunk_count=doc.get("chunk_count", 0),
                created_at=doc["created_at"],
            )
        )
    return docs


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    db = get_db()
    doc = await db.rag_documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await delete_doc_vectors(doc["session_id"], doc_id)
    await db.rag_documents.delete_one({"_id": ObjectId(doc_id)})
