"""Slide session models."""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId


DEFAULT_MARKDOWN = """---
marp: true
theme: default
paginate: true
backgroundColor: '#ffffff'
style: |
  section {
    font-family: 'Segoe UI', sans-serif;
    color: #1e1b4b;
  }
  h1 { color: #7c3aed; border-bottom: 2px solid #7c3aed; }
  h2 { color: #6d28d9; }
  strong { color: #7c3aed; }
---

# Welcome to Slide AI Agent
## Your AI-powered presentation builder

---

# Getting Started

- Ask the AI assistant to create a presentation
- Upload documents as knowledge sources
- Edit the markdown outline directly
- Preview slides in real time

---

# How It Works

1. **Describe** your presentation topic
2. **Let AI** generate a structured outline
3. **Edit** the markdown to fine-tune content
4. **Export** as PDF, PPTX, HTML, or Markdown

---

# Thank You

Built with ❤️ using Marp + LangGraph
"""


class SlideSessionCreate(BaseModel):
    title: str = "Untitled Presentation"


class SlideSessionOut(BaseModel):
    id: str
    title: str
    markdown: str
    created_at: datetime
    updated_at: datetime


class SlideSessionUpdate(BaseModel):
    title: Optional[str] = None
    markdown: Optional[str] = None
