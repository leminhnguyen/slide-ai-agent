"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from src.app.chat.routes import router as chat_router
from src.app.rag.routes import router as rag_router
from src.app.slide.routes import router as slide_router
from src.libs.config import get_settings
from src.libs.database import get_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting Slide AI Agent backend...")
    # Ping MongoDB on startup
    try:
        await get_client().admin.command("ping")
        logger.info("MongoDB connection OK")
    except Exception as e:
        logger.warning(f"MongoDB ping failed: {e}")
    yield
    logger.info("Shutting down...")


app = FastAPI(title="Slide AI Agent API", version="0.1.0", lifespan=lifespan)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(slide_router)
app.include_router(chat_router)
app.include_router(rag_router)

# Serve agent-generated assets (charts, images) so the Marp preview can load them
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok"}
