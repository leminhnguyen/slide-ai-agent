from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

from src.app.chat import routes as chat_routes
from src.app.slide.models import DEFAULT_MARKDOWN
from src.app.slide import routes as slide_routes


class InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class AsyncCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, field, direction):
        reverse = direction < 0
        self.items.sort(key=lambda item: item.get(field), reverse=reverse)
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self.items):
            raise StopAsyncIteration
        item = self.items[self._index]
        self._index += 1
        return item


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def insert_one(self, doc):
        stored = {**doc, "_id": ObjectId()}
        self.docs.append(stored)
        return InsertResult(stored["_id"])

    async def update_one(self, query, update):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                return

    async def delete_one(self, query):
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                del self.docs[index]
                return

    async def delete_many(self, query):
        self.docs = [doc for doc in self.docs if not self._matches(doc, query)]

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return doc
        return None

    def find(self, query=None, projection=None):
        query = query or {}
        return AsyncCursor([doc for doc in self.docs if self._matches(doc, query)])

    def aggregate(self, pipeline):
        if pipeline and "$group" in pipeline[-1]:
            items = self._apply_match(self.docs, pipeline[0].get("$match", {}))
            grouped = {}
            for item in items:
                key = item["session_id"]
                grouped[key] = grouped.get(key, 0) + 1
            return AsyncCursor([{"_id": key, "count": count} for key, count in grouped.items()])

        items = list(self.docs)
        for step in pipeline:
            if "$match" in step:
                items = self._apply_match(items, step["$match"])
            elif "$addFields" in step:
                for item in items:
                    item["_effective_last_activity_at"] = (
                        item.get("last_activity_at") or item.get("updated_at") or item.get("created_at")
                    )
            elif "$sort" in step:
                field, direction = next(iter(step["$sort"].items()))
                items.sort(key=lambda item: item.get(field), reverse=direction < 0)
            elif "$limit" in step:
                items = items[: step["$limit"]]
        return AsyncCursor(items)

    async def distinct(self, field):
        return list({doc.get(field) for doc in self.docs if field in doc})

    def _apply_match(self, items, query):
        return [item for item in items if self._matches(item, query)]

    def _matches(self, doc, query):
        for key, value in query.items():
            if key == "$and":
                if not all(self._matches(doc, branch) for branch in value):
                    return False
                continue
            if key == "$or":
                if not any(self._matches(doc, branch) for branch in value):
                    return False
                continue
            if isinstance(value, dict) and "$ne" in value:
                if doc.get(key) == value["$ne"]:
                    return False
                continue
            if isinstance(value, dict) and "$in" in value:
                if doc.get(key) not in value["$in"]:
                    return False
                continue
            if isinstance(value, dict) and "$regex" in value:
                import re

                flags = re.IGNORECASE if "i" in value.get("$options", "") else 0
                if not re.search(value["$regex"], str(doc.get(key, "")), flags):
                    return False
                continue
            if doc.get(key) != value:
                return False
        return True


class FakeDb:
    def __init__(self, slides=None, messages=None, documents=None):
        self.slides = FakeCollection(slides)
        self.chat_messages = FakeCollection(messages)
        self.rag_documents = FakeCollection(documents)


def make_slide(title, when):
    return {
        "_id": ObjectId(),
        "title": title,
        "markdown": "",
        "created_at": when,
        "updated_at": when,
        "last_activity_at": when,
        "has_user_activity": True,
    }


@pytest.mark.asyncio
async def test_list_sessions_returns_latest_activity_first(monkeypatch):
    base = datetime(2026, 5, 26, tzinfo=timezone.utc)
    old_slide = make_slide("Old", base)
    new_slide = make_slide("New", base + timedelta(hours=1))
    db = FakeDb(slides=[old_slide, new_slide])
    monkeypatch.setattr(slide_routes, "get_db", lambda: db)

    result = await slide_routes.list_sessions(q="", limit=50)

    assert [item.id for item in result] == [str(new_slide["_id"]), str(old_slide["_id"])]


@pytest.mark.asyncio
async def test_list_sessions_hides_unused_default_sessions(monkeypatch):
    base = datetime(2026, 5, 26, tzinfo=timezone.utc)
    unused_slide = {
        "_id": ObjectId(),
        "title": "New Presentation",
        "markdown": DEFAULT_MARKDOWN,
        "created_at": base,
        "updated_at": base,
        "last_activity_at": base,
        "has_user_activity": False,
    }
    legacy_unused_slide = {
        "_id": ObjectId(),
        "title": "New Presentation",
        "markdown": "legacy default content",
        "created_at": base + timedelta(minutes=30),
        "updated_at": base + timedelta(minutes=30),
        "last_activity_at": base + timedelta(minutes=30),
        "has_user_activity": False,
    }
    active_slide = make_slide("Edited Presentation", base + timedelta(hours=1))
    db = FakeDb(slides=[unused_slide, legacy_unused_slide, active_slide])
    monkeypatch.setattr(slide_routes, "get_db", lambda: db)

    result = await slide_routes.list_sessions(q="", limit=50)

    assert [item.id for item in result] == [str(active_slide["_id"])]


@pytest.mark.asyncio
async def test_list_sessions_searches_title_and_chat_content(monkeypatch):
    base = datetime(2026, 5, 26, tzinfo=timezone.utc)
    title_match = make_slide("Roadmap Review", base + timedelta(hours=2))
    chat_match = make_slide("Quarterly Planning", base + timedelta(hours=1))
    non_match = make_slide("Sales Update", base)
    db = FakeDb(
        slides=[title_match, chat_match, non_match],
        messages=[
            {
                "_id": ObjectId(),
                "session_id": str(chat_match["_id"]),
                "role": "user",
                "content": "Please include roadmap risks",
                "created_at": base + timedelta(minutes=5),
            },
            {
                "_id": ObjectId(),
                "session_id": str(non_match["_id"]),
                "role": "user",
                "content": "Summarize revenue",
                "created_at": base + timedelta(minutes=10),
            },
        ],
    )
    monkeypatch.setattr(slide_routes, "get_db", lambda: db)

    result = await slide_routes.list_sessions(q="roadmap", limit=50)

    assert {item.id for item in result} == {str(title_match["_id"]), str(chat_match["_id"])}
    assert all(item.id != str(non_match["_id"]) for item in result)
    assert any(item.match_preview == "Please include roadmap risks" for item in result)


@pytest.mark.asyncio
async def test_delete_session_removes_related_data(monkeypatch):
    base = datetime(2026, 5, 26, tzinfo=timezone.utc)
    slide = make_slide("Deck", base)
    other_slide = make_slide("Other deck", base + timedelta(hours=1))
    session_id = str(slide["_id"])
    other_session_id = str(other_slide["_id"])
    db = FakeDb(
        slides=[slide, other_slide],
        messages=[
            {
                "_id": ObjectId(),
                "session_id": session_id,
                "role": "user",
                "content": "Delete me",
                "created_at": base,
            },
            {
                "_id": ObjectId(),
                "session_id": other_session_id,
                "role": "user",
                "content": "Keep me",
                "created_at": base,
            },
        ],
        documents=[
            {
                "_id": ObjectId(),
                "session_id": session_id,
                "filename": "delete.md",
                "chunk_count": 1,
                "created_at": base,
            },
            {
                "_id": ObjectId(),
                "session_id": other_session_id,
                "filename": "keep.md",
                "chunk_count": 1,
                "created_at": base,
            },
        ],
    )
    deleted_vectors = []
    deleted_memory = []
    monkeypatch.setattr(slide_routes, "get_db", lambda: db)

    async def fake_delete_session_vectors(sid):
        deleted_vectors.append(sid)

    monkeypatch.setattr(slide_routes, "delete_session_vectors", fake_delete_session_vectors)

    async def fake_delete_agent_memory(sid):
        deleted_memory.append(sid)

    monkeypatch.setattr(slide_routes, "_delete_agent_memory", fake_delete_agent_memory)

    await slide_routes.delete_session(session_id)

    assert [str(item["_id"]) for item in db.slides.docs] == [other_session_id]
    assert [item["content"] for item in db.chat_messages.docs] == ["Keep me"]
    assert [item["filename"] for item in db.rag_documents.docs] == ["keep.md"]
    assert deleted_memory == [session_id]
    assert deleted_vectors == [session_id]


@pytest.mark.asyncio
async def test_chat_stream_persists_transcript_and_lists_chronologically(monkeypatch):
    slide = make_slide("Deck", datetime(2026, 5, 26, tzinfo=timezone.utc))
    db = FakeDb(slides=[slide])
    monkeypatch.setattr(chat_routes, "get_db", lambda: db)

    async def fake_stream_agent_response(*args, **kwargs):
        yield "Hello"
        yield " there"
        yield '__META__:{"slide_updated":true}'

    monkeypatch.setattr(chat_routes, "stream_agent_response", fake_stream_agent_response)

    chunks = [
        chunk async for chunk in chat_routes._sse_generator(
            str(slide["_id"]),
            "Build a deck",
            [],
            [],
        )
    ]
    messages = await chat_routes.list_messages(str(slide["_id"]))

    assert any('data: __META__:{"slide_updated":true}' in chunk for chunk in chunks)
    assert [(item.role, item.content) for item in messages] == [
        ("user", "Build a deck"),
        ("assistant", "Hello there"),
    ]
    assert messages[-1].slide_updated is True
