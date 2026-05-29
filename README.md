# Slide AI Agent 🐙
AI-powered presentation builder with a conversational agent, live Marp preview, source-document retrieval, and export to presentation formats.

![Slide AI Agent demo](be/assets/demo.gif)

---

## Agent Architecture

![Agent Architecture](be/assets/agent.png)

---

## Feature Checklist

- [x] **AI slide generation and editing** - Create, rewrite, add, delete, and edit slides through the chat agent.
- [x] **Manual Marp markdown editor** - Edit the outline directly with Markdown helpers and slide separator insertion.
- [x] **Live Marp preview** - Render saved markdown as slides, navigate slides, and keep the preview synced after saves.
- [x] **Auto-save and manual save** - Save editor changes automatically or with `Ctrl+Shift+S`.
- [x] **RAG sources** - Upload PDF, DOCX, TXT, or Markdown files for grounded slide content.
- [x] **Source selection and `@filename` tagging** - Scope chat answers to selected or explicitly tagged documents.
- [x] **Web search tool** - Search current public information and surface source links in streamed chat output.
- [x] **Chart generation** - Run sandboxed Python/matplotlib code and save chart PNGs under `/uploads/charts`.
- [x] **AI image generation and editing** - Generate or edit slide assets and save them under `/uploads/images`.
- [x] **Add generated assets to slides** - Preview images from chat and insert them into a selected slide.
- [x] **Export** - Download slides as HTML, PDF, PPTX, editable PPTX, or Markdown.
- [x] **Workspace controls** - Resize panels, collapse the left panel, rename sessions, and navigate by active slide.
- [x] **Session memory and history** - Persist slide sessions and chat transcripts with MongoDB, with recent/searchable sessions and cleanup for old sessions.
- [x] **Static asset serving** - Serve generated charts and images through `/uploads` for preview and export.

---

## Todo

- [ ] Show streaming reasoning summary and execution plan while generating slides
- [ ] Add guardrails for safety, policy, and content validation before applying agent actions
- [ ] Integrate tracing tools such as Langfuse for prompt, tool, and cost observability
- [ ] Add multi-agent orchestration for research, writing, review, and editing
- [ ] Let users switch between model types and configure their OpenAI API key in the UI
- [ ] Estimate token usage and generation cost before or during slide creation

## Installation

Prerequisites:

- Docker and Docker Compose v2
- OpenAI API key

```bash
git clone <repo-url>
cd slide-ai-agent

cp be/.env.example be/.env
# Set OPENAI_API_KEY in be/.env

docker compose up --build -d
```

Open the app:

- App: http://localhost:8999
- API docs: http://localhost:8000/docs

Session management:

- Open the history drawer from the left-panel history button.
- Search by session title or chat transcript content.
- Use the trash button on a session to delete its slides, chat history, uploaded source metadata, agent memory, and indexed vectors.

Stop services:

```bash
docker compose down
```

Remove local data:

```bash
docker compose down -v
```

---

## Project Structure

```text
slide-ai-agent/
├── be/                  # FastAPI backend, agent, RAG, slide export
│   ├── src/
│   ├── assets/
│   └── Dockerfile
├── fe/                  # React + Vite frontend
│   ├── src/
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## License

MIT
