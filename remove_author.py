# file: remove_author.py
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path("data/chat.db")
AUTHOR_NAME = "Sven!"


def main() -> None:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Banco não encontrado: {DB_PATH.resolve()}")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row

        target_rows = conn.execute(
            "SELECT sort_index FROM messages WHERE author_name = ?",
            (AUTHOR_NAME,),
        ).fetchall()

        target_sort_indexes = [row["sort_index"] for row in target_rows]

        if not target_sort_indexes:
            print(f'Nenhuma mensagem encontrada para "{AUTHOR_NAME}".')
            return

        placeholders = ",".join("?" for _ in target_sort_indexes)

        conn.execute("BEGIN")

        conn.execute(
            f"""
            UPDATE messages
            SET reply_to_sort_index = NULL
            WHERE reply_to_sort_index IN ({placeholders})
            """,
            target_sort_indexes,
        )

        conn.execute(
            "DELETE FROM messages WHERE author_name = ?",
            (AUTHOR_NAME,),
        )

        conn.execute(
            "DELETE FROM authors WHERE name = ?",
            (AUTHOR_NAME,),
        )

        conn.commit()

        remaining_messages = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE author_name = ?",
            (AUTHOR_NAME,),
        ).fetchone()[0]

        print(f'Autor removido: "{AUTHOR_NAME}"')
        print(f"Mensagens removidas: {len(target_sort_indexes)}")
        print(f"Mensagens restantes desse autor: {remaining_messages}")

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("VACUUM")

    print(f"Banco otimizado: {DB_PATH.resolve()}")


if __name__ == "__main__":
    main()
