from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from collections import Counter, defaultdict
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
    reply_to_sort_index: int | None = None


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

    original_body_lines = lines[header_line_index + 1 :]
    body_lines: list[str] = []
    reply_to_name = ""
    reply_to_text = ""
    reply_found = False

    for line in original_body_lines:
        stripped = line.strip()

        if not reply_found and stripped.startswith("↳ reply to "):
            reply_match = REPLY_PATTERN.match(stripped)
            if reply_match:
                reply_to_name = reply_match.group("reply_to_name").strip()
                reply_to_text = reply_match.group("reply_to_text").strip()
                reply_found = True
                continue

        body_lines.append(line)

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


def normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def find_reply_target(prior_messages_from_author: list[ParsedMessage], reply_text: str) -> int | None:
    if not prior_messages_from_author or not reply_text:
        return None

    target_snippet = normalize_text(reply_text)
    if not target_snippet:
        return None

    for message in reversed(prior_messages_from_author):
        content = normalize_text(message.content)
        if content and content == target_snippet:
            return message.sort_index

    for message in reversed(prior_messages_from_author):
        content = normalize_text(message.content)
        if not content:
            continue
        if target_snippet in content or content in target_snippet:
            return message.sort_index

    shortened = target_snippet[:80]
    if shortened:
        for message in reversed(prior_messages_from_author):
            content = normalize_text(message.content)
            if content and shortened in content:
                return message.sort_index

    return None


def resolve_reply_links(messages: list[ParsedMessage]) -> None:
    history_by_author: dict[str, list[ParsedMessage]] = defaultdict(list)

    for message in messages:
        if message.reply_to_name and message.reply_to_text:
            candidates = history_by_author.get(message.reply_to_name, [])
            message.reply_to_sort_index = find_reply_target(candidates, message.reply_to_text)

        history_by_author[message.author_name].append(message)


def init_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            PRAGMA journal_mode = DELETE;
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
                sort_index INTEGER NOT NULL UNIQUE,
                timestamp_iso TEXT NOT NULL,
                timestamp_display TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                reply_to_name TEXT NOT NULL,
                reply_to_text TEXT NOT NULL,
                reply_to_sort_index INTEGER NULL
            );

            CREATE TABLE authors (
                name TEXT PRIMARY KEY,
                message_count INTEGER NOT NULL
            );

            CREATE INDEX idx_messages_sort_index ON messages(sort_index);
            CREATE INDEX idx_messages_author_name ON messages(author_name);
            CREATE INDEX idx_messages_timestamp_iso ON messages(timestamp_iso);
            CREATE INDEX idx_messages_reply_target ON messages(reply_to_sort_index);
            """
        )


def read_text_with_fallbacks(txt_path: Path) -> str:
    encodings = ["utf-8", "utf-8-sig", "cp1252", "latin-1"]
    for encoding in encodings:
        try:
            return txt_path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return txt_path.read_text(encoding="utf-8", errors="replace")


def resolve_input_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()

    candidates = [
        path,
        Path.cwd() / path,
        Path(__file__).resolve().parent / path,
        Path(__file__).resolve().parent.parent / path,
    ]

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            resolved = candidate

        if resolved.exists() and resolved.is_file():
            return resolved

    checked = "\n".join(f"- {candidate.resolve()}" for candidate in candidates)
    raise FileNotFoundError(
        f"Arquivo TXT não encontrado.\n"
        f"Valor recebido: {raw_path}\n"
        f"Locais verificados:\n{checked}"
    )


def import_txt_to_sqlite(txt_path: Path, db_path: Path) -> None:
    raw_text = read_text_with_fallbacks(txt_path)
    metadata = parse_metadata(raw_text.splitlines()[:20])

    messages: list[ParsedMessage] = []
    for sort_index, block in enumerate(iter_message_blocks(raw_text), start=1):
        parsed = parse_block(block, sort_index=sort_index)
        if parsed:
            messages.append(parsed)

    resolve_reply_links(messages)
    init_database(db_path)

    author_counter: Counter[str] = Counter(message.author_name for message in messages)

    rows = [
        (
            message.sort_index,
            message.timestamp_iso,
            message.timestamp_display,
            message.author_name,
            message.author_id,
            message.content,
            message.reply_to_name,
            message.reply_to_text,
            message.reply_to_sort_index,
        )
        for message in messages
    ]

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
                reply_to_text,
                reply_to_sort_index
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    parser = argparse.ArgumentParser(description="Importa um TXT de conversa para SQLite.")
    parser.add_argument("txt_path", type=str, help="Caminho para o TXT exportado")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/chat.db"),
        help="Caminho do banco SQLite de saída",
    )
    args = parser.parse_args()

    try:
        txt_path = resolve_input_path(args.txt_path)
        db_path = args.db.resolve()
        import_txt_to_sqlite(txt_path, db_path)
        print(f"TXT importado com sucesso: {txt_path}")
        print(f"Banco gerado com sucesso em: {db_path}")
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
