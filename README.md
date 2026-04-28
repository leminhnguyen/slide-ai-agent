# Slide AI Agent

![Slide AI Agent demo](be/assets/demo.gif)

AI-powered presentation builder with a conversational agent, live Marp preview, source-document retrieval, and export to presentation formats.

## Features

| Feature | Description |
|---------|-------------|
| **AI slide generation and editing** | Create or refine slide decks through chat |
| **RAG sources** | Upload PDF, DOCX, TXT, or Markdown files for grounded slide content |
| **Live Marp preview** | Edit markdown and preview rendered slides side by side |
| **Export** | Download slides as HTML, PDF, PPTX, or Markdown |
| **Workspace controls** | Resizable panels, collapsible chat, auto-save, and slide navigation |
| **Session memory** | Conversation and slide sessions are persisted with MongoDB |

## Todo

| Item | Description |
|------|-------------|
| **Streaming reasoning and plan** | Show the agent's reasoning summary and execution plan while generating slides |
| **Guardrails** | Add safety, policy, and content validation before applying agent actions |
| **Tracing** | Integrate tracing tools such as Langfuse for prompt, tool, and cost observability |
| **Multi-agent workflow** | Add orchestration for specialized agents across research, writing, review, and editing |
| **Model settings** | Let users switch between model types and configure their OpenAI API key in the UI |
| **Cost estimation** | Estimate token usage and generation cost before or during slide creation |

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

Stop services:

```bash
docker compose down
```

Remove local data:

```bash
docker compose down -v
```

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
