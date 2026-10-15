# Sphinx.ai RAG: packages and dependencies

Everything the document question-answering system needs to run: the Python packages, the local AI
models, the vector database and the website side. For what each setting does, see `TUNING.md`.

## At a glance

| Part | What you need | Used for |
|---|---|---|
| Python | 3.10 or newer (3.12 recommended, tested on 3.13), in its own environment | all scripts |
| Python packages | `requirements.txt` (7 packages, plus what they install) | reading documents, search, talking to Ollama |
| Ollama | a recent version (0.9 or newer recommended) with 3 models | embeddings, table and figure descriptions, answers |
| Qdrant | nothing extra by default (runs inside Python); a Qdrant server for production | storing and searching the vectors |
| Node.js / Next.js | Node.js 18.18 or newer (20 LTS recommended) | the website routes that start the Python scripts |
| Internet | once, on the first run | downloading Docling's models and the bge-m3 tokenizer |

## Which file needs what

| File | Third-party packages it imports | Role |
|---|---|---|
| `rag_common.py` | `ollama`, `qdrant-client` | settings, Ollama clients, BM25 encoder, Qdrant store (shared) |
| `rag_ingest.py` | `docling`, `docling-core`, `transformers`, `pypdf`, `defusedxml` | reads uploaded files and fills the vector store |
| `rag_chat.py` | none of its own; `sentence-transformers` only if the reranker is on | query processing, retrieval and answers |
| `rag_eval.py` | none of its own | measures retrieval and answer quality |
| `runPython.ts`, `search_route.ts` | none (Node.js built-ins only) | start the Python scripts from Next.js |

Imports are loaded only when needed, so `rag_chat.py` never loads Docling and starts quickly.
`rag_query.py` and `rag_generate.py` are older versions replaced by `rag_chat.py`; you can delete them.

---

## 1. Python packages

Install with `pip install -r requirements.txt`.

| Package | Minimum | Tested with | Used for | Licence |
|---|---|---|---|---|
| `docling` | 2.130 | 2.139.0 | reading PDF and Office files: page layout, reading order, OCR, table structure | MIT |
| `docling-core[chunking]` | 2.100 | 2.101.1 | the parsed document model, structure-aware chunking, Markdown tables | MIT |
| `qdrant-client` | 1.15 | 1.19.1 | the vector store client; also runs Qdrant inside Python (local folder) | Apache-2.0 |
| `ollama` | 0.5 | 0.6.3 | talks to the local Ollama server | MIT |
| `transformers` | 4.45 | 5.19.0 | the bge-m3 tokenizer, so chunk sizes are counted in real tokens | Apache-2.0 |
| `pypdf` | 5 | 5.9.0 | quick check whether a PDF is scanned (needs full OCR) | BSD-3-Clause |
| `defusedxml` | 0.7 | 0.7.1 | safe parsing of XML inside uploaded files | PSF-2.0 |
| `sentence-transformers` *(optional)* | 5 | – | the reranker, only when `RERANK_MODEL` is set | Apache-2.0 |

These come in automatically with Docling. They are the large part of the install (several GB on disk,
mostly PyTorch):

| Package | Tested with | Why it is there |
|---|---|---|
| `torch` | 2.14.1 | runs Docling's layout and table models (and the reranker) |
| `docling-ibm-models` | 4.0.3 | the layout and TableFormer models' code |
| `docling-parse` | 7.22.3 | low-level PDF text extraction |
| `rapidocr` + `onnxruntime` | 3.10.0 + 1.29.0 | OCR for scanned pages and text inside images |
| `numpy` | 2.5.3 | numbers everywhere |
| `pydantic`, `huggingface-hub`, `tokenizers` | 2.13.5, 1.33.0, 0.23.3 | data models, model downloads, fast tokenizers |

**Use a separate environment.** Don't install into Anaconda's `base` environment: its older compiled
packages (for example `bottleneck` or `scikit-learn`) break against NumPy 2 with errors like
`numpy.dtype size changed` or `_ARRAY_API not found`.

**GPU (optional).** Docling runs on the CPU. With an NVIDIA GPU it parses faster: install the CUDA build of
PyTorch first, using the command from the selector on pytorch.org, then `requirements.txt`. Ollama uses the
GPU on its own and doesn't need this.

**Reproducible installs.** For production, freeze the exact versions you tested:
`pip freeze > requirements.lock.txt`, then install with `pip install -r requirements.lock.txt`.

---

## 2. Ollama and its models

Install Ollama from ollama.com, then pull the three models:

```bash
ollama pull bge-m3
ollama pull gemma3:12b
ollama pull qwen3:8b
```

| Model | Job | Setting | Download (approx.) | Context the code asks for |
|---|---|---|---|---|
| `bge-m3` | turns text into 1,024-number vectors; multilingual | `EMBED_MODEL` | 1.2 GB | input up to 8,192 tokens; chunks are ≤ 480 |
| `gemma3:12b` | describes figures and summarises tables during ingestion (can see images) | `ENRICH_MODEL` | 8 GB | 16,384 tokens (`ENRICH_NUM_CTX`) |
| `qwen3:8b` | rewrites follow-up questions and writes the answers | `CHAT_MODEL`, `QUERY_MODEL` | 5 GB | 16,384 tokens (`GEN_NUM_CTX`) |

- **Hardware, roughly:** a GPU with about 12 GB of memory runs `gemma3:12b` comfortably; `qwen3:8b` needs
  about 6–8 GB. Without a GPU everything works, only slowly.
- **Smaller machines:** `ENRICH_MODEL=gemma3:4b` and `CHAT_MODEL=qwen3:4b` need about half the memory, with
  somewhat weaker descriptions and answers.
- **Bigger machines:** `CHAT_MODEL=qwen3:14b` gives better answers with 12–16 GB of GPU memory.
- Models stay loaded for 30 minutes after use (`OLLAMA_KEEP_ALIVE`).
- Ollama on another machine or port: set `OLLAMA_HOST`, e.g. `OLLAMA_HOST=http://192.168.1.20:11434`.
- **Changing the embedding model** means re-ingesting everything into a new collection (`RAG_COLLECTION`);
  vectors from different models can't be mixed.

## 3. Models downloaded automatically on the first run

These come from Hugging Face the first time they're needed, then load from the local cache:

| What | When | Size |
|---|---|---|
| Docling's layout model and TableFormer | first document parsed | a few hundred MB |
| RapidOCR models | first page that needs OCR | small |
| `BAAI/bge-m3` tokenizer (`EMBED_TOKENIZER`) | first ingestion | a few MB (tokenizer files only) |
| Reranker, optional: `Qwen/Qwen3-Reranker-0.6B` or `BAAI/bge-reranker-v2-m3` | first chat with `RERANK_MODEL` set | about 1–2 GB |

- Cache folder: `~/.cache/huggingface` (Windows: `C:\Users\<you>\.cache\huggingface`). Move it with `HF_HOME`.
- To download Docling's models ahead of time: `docling-tools models download`.
- Servers without internet: run one ingestion (and one chat, if the reranker is on) while online, then set
  `HF_HUB_OFFLINE=1`.

## 4. Qdrant (vector database)

- **Default, nothing to install:** Qdrant runs inside Python and stores its data in a folder (`QDRANT_PATH`,
  default `data/qdrant`). Only one process can open that folder at a time, so an upload during a chat can
  fail. Fine for development and the demo.
- **Production:** run a Qdrant server, version 1.10 or newer (the code uses hybrid queries with RRF fusion
  and IDF for sparse vectors, both added in 1.10):

  ```bash
  docker run -d -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
  ```

  Then set `QDRANT_URL=http://localhost:6333` (and `QDRANT_API_KEY` for Qdrant Cloud) and ingest the
  documents again into the server.

## 5. Website side (Next.js)

- Node.js 18.18 or newer. No extra npm packages: `runPython.ts` only uses `node:child_process` and `node:path`.
- Routes that start Python must run on the Node.js runtime, not Edge: `export const runtime = "nodejs";`
- Set these in `.env.local` and restart the dev server:

  ```bash
  PYTHON_BIN=C:\Users\<you>\Anaconda3\envs\sphinx-rag\python.exe   # the environment from step 6
  RAG_DIR=C:\path\to\Sphinx_Website\scripts                        # folder with rag_*.py
  QDRANT_PATH=C:\path\to\Sphinx_Website\data\qdrant                # absolute, so upload and chat share it
  RAG_ARTIFACT_DIR=C:\path\to\Sphinx_Website\data\artifacts
  ```

---

## 6. Install, step by step

**With conda:**

```bash
conda create -n sphinx-rag python=3.12 -y
conda activate sphinx-rag
pip install -r requirements.txt
pip install -U sentence-transformers        # optional: only for the reranker
```

**With plain Python (venv):**

```bash
python -m venv .venv
.venv\Scripts\activate                      # Windows
source .venv/bin/activate                   # macOS / Linux
pip install -r requirements.txt
```

**Then, in both cases:**

```bash
ollama pull bge-m3
ollama pull gemma3:12b
ollama pull qwen3:8b
docling-tools models download               # optional: fetch Docling's models now instead of on first use
```

## 7. Check that everything works

```bash
python -c "import docling, docling_core, qdrant_client, ollama, transformers, pypdf, defusedxml; print('packages ok')"
ollama list                                                       # should list the three models
python rag_ingest.py ingest --tenant public docs\sample.pdf       # use one of your own PDFs
python rag_chat.py --ask "What is this document about?"
python rag_chat.py --find "your search words" -k 5                # shows the passages it found
```

## 8. Environment variables: paths, models and services

All of them are optional; the defaults are shown. Retrieval and answer settings are in `TUNING.md`.

| Variable | Default | What it sets |
|---|---|---|
| `QDRANT_PATH` | `data/qdrant` | folder for the built-in Qdrant (use an absolute path) |
| `QDRANT_URL`, `QDRANT_API_KEY` | not set | use a Qdrant server instead of the folder |
| `RAG_COLLECTION` | `documents_v1` | collection name; a new one for a new embedding model or for tests |
| `RAG_ARTIFACT_DIR` | `data/artifacts` | where original files, parsed JSON and figure images are kept |
| `EMBED_MODEL` | `bge-m3` | Ollama embedding model |
| `EMBED_TOKENIZER` | `BAAI/bge-m3` | Hugging Face tokenizer matching the embedding model |
| `ENRICH_MODEL` | `gemma3:12b` | Ollama vision model for tables and figures |
| `CHAT_MODEL` | `qwen3:8b` | Ollama model for answers |
| `QUERY_MODEL` | same as `CHAT_MODEL` | Ollama model for rewriting follow-up questions |
| `RERANK_MODEL` | not set (off) | Hugging Face reranker, e.g. `Qwen/Qwen3-Reranker-0.6B` |
| `OLLAMA_HOST` | `http://localhost:11434` | where Ollama runs (read by the `ollama` package) |
| `OLLAMA_KEEP_ALIVE` | `30m` | how long Ollama keeps models loaded |
| `PUBLIC_TENANT` | `public` | name for the website's own documents |
| `MAX_FILE_BYTES`, `MAX_PAGES` | 200 MB, 2,000 | limits for uploaded files |
| `PARSE_TIMEOUT_S` | `900` | time limit for parsing one document |
| `LOG_LEVEL` | `INFO` | logging detail for ingestion (to stderr) |
| `HF_HOME`, `HF_HUB_OFFLINE` | not set | Hugging Face cache folder; offline mode |

## 9. Troubleshooting

| Problem | Cause and fix |
|---|---|
| `numpy.dtype size changed` or `_ARRAY_API not found` | packages installed into Anaconda `base`: create the separate environment (step 6) |
| works in the terminal, fails from the website with `ModuleNotFoundError` | `PYTHON_BIN` points to another Python: set it to the environment's `python.exe` |
| `Connection refused` / `Failed to connect to Ollama` | Ollama isn't running: start the Ollama app or `ollama serve` |
| `model "…" not found, try pulling it first` | run `ollama pull <model>` |
| `Storage folder … is already accessed by another instance of Qdrant client` | two processes opened the built-in Qdrant: wait, or run a Qdrant server (section 4) |
| `KeyError: 'qwen3'` when the reranker loads | `transformers` too old: `pip install -U "transformers>=4.51" sentence-transformers` |
| the first upload takes minutes | one-time model downloads (section 3); later uploads are faster |
| out of GPU memory | smaller models (section 2), or lower `ENRICH_NUM_CTX` / `GEN_NUM_CTX` to 8192 |

## 10. Licences

| Component | Licence |
|---|---|
| docling, docling-core, ollama (Python client) | MIT |
| qdrant-client, transformers, sentence-transformers | Apache-2.0 |
| pypdf, PyTorch | BSD-3-Clause |
| defusedxml | PSF-2.0 |
| bge-m3 | MIT |
| Qwen3 models (`qwen3:8b`, Qwen3-Reranker) | Apache-2.0 |
| Gemma 3 (`gemma3:12b`) | Gemma Terms of Use (commercial use allowed under Google's terms) |
| Docling's layout and table models | see their Hugging Face model cards |

Check each licence before commercial use; this table is a summary, not legal advice.
