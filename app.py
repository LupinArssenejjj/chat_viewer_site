from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "chat.db"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Kyodo Chat Viewer")


def get_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Banco de dados não encontrado. Rode o import_chat.py antes de iniciar o site.",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def build_filters(author: str, text: str) -> tuple[str, list[Any]]:
    conditions: list[str] = []
    params: list[Any] = []

    author = author.strip()
    text = text.strip().lower()

    if author:
        conditions.append("author_name = ?")
        params.append(author)

    if text:
        conditions.append(
            """
            (
                lower(content) LIKE ?
                OR lower(reply_to_name) LIKE ?
                OR lower(reply_to_text) LIKE ?
            )
            """
        )
        like_value = f"%{text}%"
        params.extend([like_value, like_value, like_value])

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_sql, params


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                (SELECT value FROM meta WHERE key = 'chat_name') AS chat_name,
                (SELECT value FROM meta WHERE key = 'circle_name') AS circle_name,
                (SELECT value FROM meta WHERE key = 'exported_at') AS exported_at,
                (SELECT COUNT(*) FROM messages) AS total_messages,
                (SELECT COUNT(*) FROM authors) AS total_authors,
                (SELECT MIN(timestamp_iso) FROM messages) AS first_message_at,
                (SELECT MAX(timestamp_iso) FROM messages) AS last_message_at
            """
        ).fetchone()
    return row_to_dict(row)


@app.get("/api/authors")
def authors(
    query: str = Query(default="", max_length=200),
    limit: int = Query(default=80, ge=1, le=200),
) -> dict[str, Any]:
    normalized_query = query.strip().lower()

    with get_connection() as conn:
        if normalized_query:
            rows = conn.execute(
                """
                SELECT name, message_count
                FROM authors
                WHERE lower(name) LIKE ?
                ORDER BY message_count DESC, name COLLATE NOCASE ASC
                LIMIT ?
                """,
                (f"%{normalized_query}%", limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT name, message_count
                FROM authors
                ORDER BY message_count DESC, name COLLATE NOCASE ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

    return {"items": [row_to_dict(row) for row in rows], "query": query, "limit": limit}


@app.get("/api/messages")
def messages(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=80, ge=1, le=200),
) -> dict[str, Any]:
    offset = (page - 1) * page_size

    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS total FROM messages").fetchone()["total"]
        rows = conn.execute(
            """
            SELECT
                sort_index,
                timestamp_iso,
                timestamp_display,
                author_name,
                content,
                reply_to_name,
                reply_to_text
            FROM messages
            ORDER BY sort_index ASC
            LIMIT ? OFFSET ?
            """,
            (page_size, offset),
        ).fetchall()

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": [row_to_dict(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


@app.get("/api/search")
def search(
    author: str = Query(default="", max_length=500),
    text: str = Query(default="", max_length=500),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    where_sql, params = build_filters(author, text)
    offset = (page - 1) * page_size

    with get_connection() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM messages {where_sql}",
            params,
        ).fetchone()["total"]

        rows = conn.execute(
            f"""
            SELECT
                sort_index,
                timestamp_display,
                author_name,
                content,
                reply_to_name,
                reply_to_text
            FROM messages
            {where_sql}
            ORDER BY sort_index ASC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "items": [row_to_dict(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "filters": {"author": author.strip(), "text": text.strip()},
    }


@app.get("/api/context")
def context(
    sort_index: int = Query(..., ge=1),
    window: int = Query(default=20, ge=3, le=150),
) -> dict[str, Any]:
    start = max(1, sort_index - window)
    end = sort_index + window

    with get_connection() as conn:
        target = conn.execute(
            """
            SELECT
                sort_index,
                timestamp_iso,
                timestamp_display,
                author_name,
                content,
                reply_to_name,
                reply_to_text
            FROM messages
            WHERE sort_index = ?
            """,
            (sort_index,),
        ).fetchone()

        if target is None:
            raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

        rows = conn.execute(
            """
            SELECT
                sort_index,
                timestamp_iso,
                timestamp_display,
                author_name,
                content,
                reply_to_name,
                reply_to_text
            FROM messages
            WHERE sort_index BETWEEN ? AND ?
            ORDER BY sort_index ASC
            """,
            (start, end),
        ).fetchall()

    return {
        "target_sort_index": sort_index,
        "range_start": start,
        "range_end": end,
        "target": row_to_dict(target),
        "items": [row_to_dict(row) for row in rows],
    }
