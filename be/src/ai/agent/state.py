"""Agent state definition."""
from typing import Annotated, Dict, Any, List, Optional
from typing_extensions import TypedDict
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], add_messages]
    language: str
    session_id: str


class AgentContext(BaseModel):
    session_id: str = Field(description="Slide session ID")
    slide_updated: bool = Field(default=False, description="Whether the outline was updated this turn")
    selected_document_ids: list[str] = Field(default_factory=list, description="Documents selected as default RAG context")
    tagged_document_ids: list[str] = Field(default_factory=list, description="Documents explicitly tagged in the current user message")
