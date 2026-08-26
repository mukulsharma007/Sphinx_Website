import json

import chromadb
import ollama

JSONL_FILE = "Sphinx_Website\data\corpus.jsonl"
MODEL = "bge-large:latest"
DB_PATH = "Sphinx_Website\data\chroma_db"
COLLECTION_NAME = "documents"

client = chromadb.PersistentClient(path=DB_PATH)
collection = client.get_or_create_collection(name=COLLECTION_NAME)

with open(JSONL_FILE, "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        line = line.strip()
        if not line:
            continue

        data = json.loads(line)
        title = data["title"]
        text = data["text"]

        # embed one text at a time
        response = ollama.embeddings(model=MODEL, prompt=text)
        embedding = response["embedding"]

        collection.add(
            ids=[str(i)],
            embeddings=[embedding],
            documents=[text],
            metadatas=[{"title": title}],
        )

        print(i, "-", title)

print("Done, stored", collection.count(), "documents")