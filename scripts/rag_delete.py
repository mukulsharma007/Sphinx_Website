#!/usr/bin/env python3
"""Delete all indexed documents and stored artifacts for one demo session."""
from __future__ import annotations

import logging
import json
import re
import shutil
import sys
from typing import Any

from rag_common import QdrantStore, Settings, configure_stdio, read_stdin_text, write_json

log = logging.getLogger("rag_delete")
SESSION_RE = re.compile(r"^[0-9a-f-]{36}$", re.I)


def delete_session(session_id: str, settings: Settings | None = None) -> None:
    """Remove a session's vector records and every persisted artifact for its documents."""
    settings = settings or Settings()
    store = QdrantStore(settings)
    try:
        if store.client.collection_exists(store.collection):
            from qdrant_client import models as m

            store.client.delete(
                store.collection,
                points_selector=m.FilterSelector(filter=store.tenant_filter(session_id)),
                wait=True,
            )

        artifact_root = settings.artifact_dir.resolve()
        tenant_dir = (settings.artifact_dir / session_id).resolve()
        if tenant_dir.parent != artifact_root:
            raise ValueError("The session artifact directory is outside the artifact root.")
        if tenant_dir.exists():
            shutil.rmtree(tenant_dir)
    finally:
        store.close()


def main() -> int:
    configure_stdio()
    logging.basicConfig(
        level="INFO",
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        payload: Any = json.loads(read_stdin_text())
    except (json.JSONDecodeError, UnicodeDecodeError):
        print("Invalid delete request.", file=sys.stderr)
        return 1

    session_id = payload.get("sessionId") if isinstance(payload, dict) else None
    if not isinstance(session_id, str) or not SESSION_RE.fullmatch(session_id):
        print("Invalid demo session.", file=sys.stderr)
        return 1

    try:
        delete_session(session_id)
    except Exception as exc:
        log.exception("could not delete demo session %s", session_id)
        print(f"Document deletion failed: {type(exc).__name__}.", file=sys.stderr)
        return 1

    write_json({"ok": True})
    return 0


if __name__ == "__main__":
    sys.exit(main())
