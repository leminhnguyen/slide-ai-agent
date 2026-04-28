# Slide AI Agent

<video src="be/assets/slide-ai-agent.mp4" controls width="100%"></video>

**v1.0.0** — AI-powered presentation builder with a conversational agent, live Marp preview, and drag-to-resize workspace.

---

## What it does

| Feature | Description |
|---------|-------------|
| **AI Agent** | Chat with a LangGraph ReAct agent (GPT-5.2) to generate or edit slides in natural language |
| **RAG Sources** | Upload PDF, DOCX, TXT or MD files — the agent searches them when building content |
| **Live Preview** | Rendered Marp HTML preview in a sandboxed iframe, auto-refreshes on save |
| **Outline Editor** | CodeMirror 6 editor with markdown toolbar (Bold, Italic, H1–H3, separator, code) |
| **Auto-save** | Toggle auto-save; manual save with `Ctrl+Shift+S` when off |
| **Export** | Download as HTML, PDF, PPTX, or raw Markdown via marp-cli |
| **Resizable panels** | Drag the two dividers to resize left/centre/right panels |
| **Collapsible chat** | Collapse/expand the left agent panel with a single click |
| **Session memory** | Conversation history checkpointed in MongoDB per presentation session |
| **Slide navigation** | Click in the editor to jump the preview to that slide; prev/next arrows in preview |

---

## Architecture

```
Browser (React + Vite)
  ├── Chat panel    ──SSE──►  FastAPI  ──►  LangGraph ReAct Agent (GPT-5.2)
  │                                              └── tools: get/update outline,
  │                                                          add/delete slide, RAG search
  ├── Outline editor ──REST──►  Slide Session API  ──►  MongoDB
  └── Slide preview  ──REST──►  marp-cli export    ──►  HTML / PDF / PPTX

RAG pipeline:  upload ──► PyMuPDF / python-docx ──► OpenAI embeddings ──► Qdrant
```

**Stack:** FastAPI · LangGraph 0.3 · LangChain · OpenAI GPT-5.2 · Qdrant · MongoDB · marp-cli · React 18 · TypeScript · Vite 5 · Tailwind CSS · CodeMirror 6 · Docker Compose

---

## Installation

### Prerequisites
- Docker & Docker Compose v2
- OpenAI API key

### Steps

```bash
# 1. Clone
git clone <repo-url> && cd slide-ai-agent

# 2. Configure
cp be/.env.example be/.env
# Edit be/.env — set OPENAI_API_KEY=sk-...

# 3. Start
docker compose up --build -d
```

| Service | URL |
|---------|-----|
| App | http://localhost:8999 |
| API docs | http://localhost:8000/docs |

```bash
# Stop
docker compose down

# Wipe all data (MongoDB + Qdrant volumes)
docker compose down -v
```

---

## Usage

1. Open http://localhost:8999
2. Type a topic in the **Chat** panel — the agent generates a full slide deck
3. Edit the markdown directly in the **Outline** editor
4. Switch to **Sources** tab to upload reference documents (PDF, DOCX, TXT, MD)
5. Ask the agent to refine content using the uploaded sources
6. Click **Export** → choose HTML, PDF, PPTX, or Markdown

**Keyboard shortcuts in editor:** `Ctrl+Shift+S` — manual save/render

---

## Project structure

```
slide-ai-agent/
├── be/                  # FastAPI backend
│   ├── src/
│   │   ├── app/slide/   # Session CRUD + marp-cli export
│   │   ├── app/rag/     # File upload, parsing, Qdrant ops
│   │   ├── app/chat/    # SSE streaming endpoint
│   │   ├── ai/agent/    # LangGraph agent, tools, prompts
│   │   └── libs/        # Config, MongoDB, Qdrant clients
│   └── Dockerfile
├── fe/                  # React frontend
│   ├── src/
│   │   ├── components/  # PanelDivider
│   │   ├── hooks/       # useResizePanel (Pointer Capture API)
│   │   └── pages/Home/  # Home, Topbar, OutlineEditor,
│   │                    # SlidePreview, ChatPanel, SourcesPanel
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## License

MIT


## Features

| Feature | Description |
|---------|-------------|
| **AI Agent chat** | LangGraph ReAct agent (GPT-5.2) creates and edits slides via natural language |
| **Marp rendering** | Live iframe preview of Marp-flavoured markdown; export as HTML / PDF / PPTX / MD |
| **RAG sources** | Upload PDF, DOCX, TXT or MD files; agent can search them when building content |
| **Outline editor** | CodeMirror 6 with markdown toolbar and 1-second auto-save |
| **Resizable panels** | Drag dividers to resize left/centre/right panels; collapse the agent panel entirely |
| **Session memory** | Conversations checkpointed in MongoDB per session via `langgraph-checkpoint-mongodb` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (React)                    │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │  Chat panel  │  │ Outline editor │  │Slide preview│ │
│  │  (SSE stream)│  │  (CodeMirror)  │  │  (Marp HTML)│ │
│  └──────┬───────┘  └───────┬────────┘  └──────┬──────┘ │
└─────────┼──────────────────┼───────────────────┼────────┘
          │ /api/chat        │ /api/slides        │ /api/slides/{id}/export
          ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI  (Python 3.12)                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │            LangGraph ReAct Agent                │    │
│  │  tools: get_outline · update_outline            │    │
│  │         add_slide · delete_slide                │    │
│  │         search_documents (Qdrant RAG)           │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │                                    │
│          ┌──────────┴──────────┐                        │
│          ▼                     ▼                        │
│      MongoDB               Qdrant                       │
│  (sessions + history)   (doc embeddings)                │
└─────────────────────────────────────────────────────────┘
```

**Stack**

| Layer | Technology |
|-------|-----------|
| LLM | OpenAI GPT-5.2 + text-embedding-3-small |
| Agent | LangGraph 0.3 ReAct, `langgraph-checkpoint-mongodb` |
| Backend | FastAPI 0.115, Python 3.12, Motor (async MongoDB) |
| Vector DB | Qdrant (per-session collections) |
| Slide export | marp-cli (HTML / PDF / PPTX) |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS (violet palette) |
| State | Zustand 5, TanStack Query 5 |
| Editor | CodeMirror 6 (`@uiw/react-codemirror`) |
| Infra | Docker Compose (4 services) |

---

## Quick Start

### Prerequisites
- Docker & Docker Compose v2
- An [OpenAI API key](https://platform.openai.com/account/api-keys)

### 1 — Clone & configure

```bash
git clone <repo-url>
cd slide-ai-agent

cp be/.env.example be/.env
# Edit be/.env and set OPENAI_API_KEY=sk-...
```

### 2 — Start all services

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8999 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| MongoDB | localhost:27077 |
| Qdrant dashboard | http://localhost:6333/dashboard |

### 3 — Stop

```bash
docker compose down          # keep data
docker compose down -v       # remove volumes (wipe DB)
```

---


## Environment Variables (`be/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | **Required.** OpenAI secret key |
| `OPENAI_MODEL` | `gpt-5.2` | Chat model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `MONGODB_URI` | `mongodb://root:example@app_mongo:27017/?authSource=admin` | MongoDB connection string |
| `MONGODB_DB` | `slide_agent` | Database name |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant base URL |
| `MARP_CLI_PATH` | `marp` | Path to marp-cli binary |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:80` | Allowed CORS origins |

---

## Project Structure

```
slide-ai-agent/
├── be/                         # FastAPI backend
│   ├── src/
│   │   ├── main.py             # App entry point, lifespan, CORS
│   │   ├── libs/               # config, database, qdrant helpers
│   │   ├── app/
│   │   │   ├── slide/          # Session CRUD + marp-cli export
│   │   │   ├── rag/            # File upload, parsing, Qdrant ops
│   │   │   └── chat/           # SSE chat endpoint
│   │   └── ai/
│   │       └── agent/          # LangGraph agent, tools, prompts
│   ├── Dockerfile
│   └── pyproject.toml
├── fe/                         # React frontend
│   ├── src/
│   │   ├── api/                # slideApi, chatApi, ragApi
│   │   ├── components/         # PanelDivider
│   │   ├── hooks/              # useResizePanel
│   │   ├── pages/Home/         # Home, Topbar, OutlineEditor,
│   │   │                       # SlidePreview, ChatPanel, SourcesPanel
│   │   ├── store/              # Zustand useAppStore
│   │   └── types/              # TypeScript interfaces
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Slide Format

Slides are written in [Marp](https://marp.app/) Markdown. Use `---` to separate slides:

```markdown
---
marp: true
theme: default
paginate: true
---

# Slide 1 title

Content here

---

# Slide 2 title

More content
```

The AI agent follows the same format when generating or editing slides.

---

## License

MIT
