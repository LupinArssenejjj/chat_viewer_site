# import_chat.py
from __future__ import annotations

import argparse
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator

HEADER_PATTERN = re.compile(
    r"^\[(?P<timestamp>\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})\] (?P<author_name>.+?) \((?P<author_id>.+?)\)$"
)
REPLY_PATTERN = re.compile(r"^↳ reply to (?P<reply_to_name>.*?): ?(?P<reply_to_text>.*)$")
MESSAGE_SEPARATOR = "-" * 84


@dataclass(slots=True)
class ParsedMessage:
    sort_index: int
    timestamp_iso: str
    timestamp_display: str
    author_name: str
    author_id: str
    content: str
    reply_to_name: str
    reply_to_text: str


def parse_metadata(lines: list[str]) -> dict[str, str]:
    metadata: dict[str, str] = {}

    for line in lines:
        if line.startswith("CIRCLE: "):
            metadata["circle_name"] = line.removeprefix("CIRCLE: ").strip()
        elif line.startswith("CHAT: "):
            metadata["chat_name"] = line.removeprefix("CHAT: ").strip()
        elif line.startswith("EXPORTED_AT: "):
            metadata["exported_at"] = line.removeprefix("EXPORTED_AT: ").strip()

    return metadata


def iter_message_blocks(text: str) -> Iterator[str]:
    for block in text.split(MESSAGE_SEPARATOR):
        block = block.strip("\r\n")
        if block:
            yield block


def parse_block(block: str, sort_index: int) -> ParsedMessage | None:
    lines = block.splitlines()

    header_line_index = next((i for i, line in enumerate(lines) if line.startswith("[")), None)
    if header_line_index is None:
        return None

    header_line = lines[header_line_index].strip()
    header_match = HEADER_PATTERN.match(header_line)
    if not header_match:
        return None

    body_lines = lines[header_line_index + 1 :]
    reply_to_name = ""
    reply_to_text = ""

    if body_lines and body_lines[-1].startswith("↳ reply to "):
        reply_match = REPLY_PATTERN.match(body_lines[-1].strip())
        if reply_match:
            reply_to_name = reply_match.group("reply_to_name").strip()
            reply_to_text = reply_match.group("reply_to_text").strip()
        body_lines = body_lines[:-1]

    content = "\n".join(body_lines).strip()

    timestamp_display = header_match.group("timestamp")
    timestamp_iso = datetime.strptime(timestamp_display, "%d/%m/%Y %H:%M:%S").isoformat()

    return ParsedMessage(
        sort_index=sort_index,
        timestamp_iso=timestamp_iso,
        timestamp_display=timestamp_display,
        author_name=header_match.group("author_name").strip(),
        author_id=header_match.group("author_id").strip(),
        content=content,
        reply_to_name=reply_to_name,
        reply_to_text=reply_to_text,
    )


def init_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            DROP TABLE IF EXISTS meta;
            DROP TABLE IF EXISTS messages;
            DROP TABLE IF EXISTS authors;

            CREATE TABLE meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sort_index INTEGER NOT NULL,
                timestamp_iso TEXT NOT NULL,
                timestamp_display TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                reply_to_name TEXT NOT NULL,
                reply_to_text TEXT NOT NULL
            );

            CREATE TABLE authors (
                name TEXT PRIMARY KEY,
                message_count INTEGER NOT NULL
            );

            CREATE INDEX idx_messages_sort_index ON messages(sort_index);
            CREATE INDEX idx_messages_author_name ON messages(author_name);
            CREATE INDEX idx_messages_timestamp_iso ON messages(timestamp_iso);
            """
        )


def import_txt_to_sqlite(txt_path: Path, db_path: Path) -> None:
    raw_text = txt_path.read_text(encoding="utf-8", errors="replace")
    metadata = parse_metadata(raw_text.splitlines()[:20])

    init_database(db_path)

    author_counter: Counter[str] = Counter()
    rows: list[tuple] = []

    for sort_index, block in enumerate(iter_message_blocks(raw_text), start=1):
        parsed = parse_block(block, sort_index=sort_index)
        if not parsed:
            continue

        author_counter[parsed.author_name] += 1
        rows.append(
            (
                parsed.sort_index,
                parsed.timestamp_iso,
                parsed.timestamp_display,
                parsed.author_name,
                parsed.author_id,
                parsed.content,
                parsed.reply_to_name,
                parsed.reply_to_text,
            )
        )

    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            """
            INSERT INTO messages (
                sort_index,
                timestamp_iso,
                timestamp_display,
                author_name,
                author_id,
                content,
                reply_to_name,
                reply_to_text
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )

        conn.executemany(
            "INSERT INTO authors (name, message_count) VALUES (?, ?)",
            sorted(author_counter.items(), key=lambda item: (-item[1], item[0].lower())),
        )

        conn.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            sorted(metadata.items()),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa um TXT de conversa para um banco SQLite.")
    parser.add_argument("txt_path", type=Path, help="Caminho para o arquivo TXT exportado")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/chat.db"),
        help="Caminho do banco SQLite de saída",
    )
    args = parser.parse_args()

    import_txt_to_sqlite(args.txt_path.resolve(), args.db.resolve())
    print(f"Banco gerado com sucesso em: {args.db.resolve()}")


if __name__ == "__main__":
    main()
