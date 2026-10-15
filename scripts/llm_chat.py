import sys
import json
from pathlib import Path

import chromadb
import ollama

DB_PATH = str(Path("data") / "chroma_db")
COLLECTION_NAME = "documents"
EMBED_MODEL = "bge-large:latest"
CHAT_MODEL = "mistral:latest"
TOP_K = 4
MAX_TURNS = 6

SYSTEM_PROMPT = (
    "You are a helpful assistant for the Sphinx website. "
    "Answer the user's question using only the context provided. "
    "If the context does not contain the answer, say you don't know "
    "instead of guessing. Keep answers short."
)


def retrieve(question, session_id=None):
    """Embed the question and pull the closest documents out of Chroma."""
    client = chromadb.PersistentClient(path=DB_PATH)
    collection = client.get_collection(name=COLLECTION_NAME)

    response = ollama.embeddings(model=EMBED_MODEL, prompt=question, keep_alive=True)

    # query_embeddings, not query_texts - the vectors came from Ollama
    query_options = {}
    if session_id:
        query_options["where"] = {"session_id": session_id}

    results = collection.query(
        query_embeddings=[response["embedding"]],
        n_results=TOP_K,
        include=["documents", "metadatas"],
        **query_options,
    )

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]

    parts = []
    for doc, meta in zip(documents, metadatas):
        title = meta.get("title", "Untitled")
        parts.append(f"[{title}]\n{doc}")

    return "\n\n---\n\n".join(parts)


def clean_messages(messages):
    """Keep the recent user/assistant turns and drop anything malformed."""
    history = []
    for m in messages[-MAX_TURNS:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            history.append({"role": role, "content": content.strip()})
    return history


def answer(history, context):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += history[:-1]
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {history[-1]['content']}",
    })

    response = ollama.chat(
        model=CHAT_MODEL,
        messages=messages,
        options={"temperature": 0.3},
        keep_alive=True,

    )
    return response["message"]["content"].strip()


def reply(text):
    print(json.dumps({"reply": text}))


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        reply("I didn't receive a message.")
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        reply("I couldn't read that request.")
        return

    messages = payload.get("messages")
    if not isinstance(messages, list):
        reply("Invalid message format.")
        return

    history = clean_messages(messages)
    if not history or history[-1]["role"] != "user":
        reply("I didn't receive a question.")
        return

    question = history[-1]["content"]

    session_id = payload.get("sessionId")
    if session_id is not None and (
        not isinstance(session_id, str)
        or len(session_id) != 36
        or any(char not in "0123456789abcdef-" for char in session_id.lower())
    ):
        reply("Invalid demo session.")
        return

    try:
        context = retrieve(question, session_id=session_id)
    except Exception as exc:
        print(f"retrieval failed: {exc}", file=sys.stderr)
        sys.exit(1)

    if not context:
        reply("I couldn't find anything about that on the site.")
        return

    try:
        reply(answer(history, context))
    except Exception as exc:
        print(f"chat call failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()