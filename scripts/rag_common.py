"""
rag_common.py — the contract shared by ingestion (rag_ingest.py) and the chat (rag_chat.py).

Anything that must be identical on both sides lives here, so the two can't drift apart:

  * Settings          one configuration for both processes (environment variables)
  * OllamaEmbedder    same model, same document/query prefixes, same normalization
  * BM25 functions    same tokenization and term hashing for documents and queries
  * QdrantStore       same collection, vector names, distance metric and tenant filter

Payload fields written by ingestion and read by retrieval
  tenant_id, doc_id, doc_sha256, source_key, file_name, title, chunk_index,
  chunk_type ("text" | "table" | "figure"), text (what the LLM reads),
  embed_text (what was embedded), headings, pages, page_start, page_end, bboxes,
  element_refs, labels, group_key, caption, summary, table_markdown, table_shape,
  image_uri, description, context, parser, parse_quality, parse_complete, embed_model,
  pipeline_version, ingested_at
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

log = logging.getLogger("rag")

TENANT_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


# ──────────────────────────────────────────────────────────────────────────────
# stdin/stdout for the Node/Next.js bridge
# ──────────────────────────────────────────────────────────────────────────────
# On Windows, Python decodes pipes with the ANSI code page (e.g. cp1252) unless told
# otherwise: non-ASCII questions arrive garbled and printing some characters crashes.

def configure_stdio() -> None:
    """UTF-8 for stdout/stderr regardless of OS locale; never crash on an odd character."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
        except (AttributeError, ValueError):
            pass


def read_stdin_text() -> str:
    """Read all of stdin as UTF-8 (a BOM from PowerShell or Windows tools is dropped)."""
    return sys.stdin.buffer.read().decode("utf-8-sig", errors="replace")


def write_json(obj: Any) -> None:
    """One JSON document on stdout, ASCII-escaped so any reader decodes it correctly."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stdout.flush()


# ──────────────────────────────────────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────────────────────────────────────

def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    # Vector store. No URL -> embedded on-disk Qdrant: dev only, and only one process can
    # open it at a time. Run a Qdrant server when ingestion and queries run in parallel.
    qdrant_url: str | None = os.getenv("QDRANT_URL")
    qdrant_api_key: str | None = os.getenv("QDRANT_API_KEY")
    qdrant_path: str = os.getenv("QDRANT_PATH", "data/qdrant")
    # Version the collection; point your app at an alias and swap it on re-index.
    collection: str = os.getenv("RAG_COLLECTION", "documents_v1")
    artifact_dir: Path = Path(os.getenv("RAG_ARTIFACT_DIR", "data/artifacts"))

    # Embeddings (Ollama). bge-m3: multilingual, 8k context, 1024-d.
    embed_model: str = os.getenv("EMBED_MODEL", "bge-m3")
    # Hugging Face tokenizer that matches the embedding model (used for chunk sizing).
    tokenizer_id: str = os.getenv("EMBED_TOKENIZER", "BAAI/bge-m3")
    embed_max_tokens: int = int(os.getenv("EMBED_MAX_TOKENS", "8192"))
    # Some models need prefixes/instructions (e5: "passage: "/"query: ", Qwen3-Embedding:
    # an "Instruct: ...\nQuery: " prefix on queries only). bge-m3 needs none.
    doc_prefix: str = os.getenv("EMBED_DOC_PREFIX", "")
    query_prefix: str = os.getenv("EMBED_QUERY_PREFIX", "")
    max_chunk_tokens: int = int(os.getenv("MAX_CHUNK_TOKENS", "480"))
    embed_batch_size: int = int(os.getenv("EMBED_BATCH_SIZE", "32"))

    # Ingestion: enrichment (Ollama). One multimodal model handles tables and figures.
    enrich_model: str = os.getenv("ENRICH_MODEL", "gemma3:12b")
    enrich_num_ctx: int = int(os.getenv("ENRICH_NUM_CTX", "16384"))  # fits the 24k-char context prompt
    describe_figures: bool = _env_flag("DESCRIBE_FIGURES", True)
    summarize_tables: bool = _env_flag("SUMMARIZE_TABLES", True)
    contextual_chunks: bool = _env_flag("CONTEXTUAL_CHUNKS", False)  # LLM call per chunk
    context_doc_chars: int = 24_000
    min_figure_px: int = 96  # smaller, uncaptioned images are treated as decoration

    # Ingestion: safety limits for untrusted uploads.
    max_file_bytes: int = int(os.getenv("MAX_FILE_BYTES", str(200 * 1024 * 1024)))
    max_pages: int = int(os.getenv("MAX_PAGES", "2000"))
    max_zip_ratio: float = 100.0
    parse_timeout_s: float = float(os.getenv("PARSE_TIMEOUT_S", "900"))
    pipeline_version: str = "2026.10.2"

    # Retrieval.
    retrieval_candidates: int = int(os.getenv("RETRIEVAL_CANDIDATES", "50"))  # per signal
    top_k: int = int(os.getenv("TOP_K", "8"))
    # Optional cross-encoder reranker (needs sentence-transformers), e.g. "Qwen/Qwen3-Reranker-0.6B"
    # or "BAAI/bge-reranker-v2-m3". Scores are mapped to 0..1. Best on a GPU or in a long-running
    # process: the model is loaded once per process.
    rerank_model: str | None = os.getenv("RERANK_MODEL")
    # Drop hits below this reranker score (only applied when a reranker is configured).
    # Calibrate on your own eval set; 0 keeps everything.
    min_rerank_score: float = float(os.getenv("MIN_RERANK_SCORE", "0"))
    # Documents without a session (the website's own content) are ingested under this tenant.
    public_tenant: str = os.getenv("PUBLIC_TENANT", "public")
    # With a session: search only the session's uploads (False), or those plus public docs (True).
    include_public_in_sessions: bool = _env_flag("INCLUDE_PUBLIC_IN_SESSIONS", False)
    # Neighbour expansion: also return the chunk(s) just before/after a text hit in the same
    # section, merged into one passage (keeps a question together with its answer). 0 = off.
    expand_neighbors: int = int(os.getenv("EXPAND_NEIGHBORS", "1"))
    max_passage_chars: int = int(os.getenv("MAX_PASSAGE_CHARS", "6000"))
    # Drop hits whose cosine similarity to the question is below this. 0 = off. Calibrate on
    # your own data: log the "similarity" of good and bad hits, then pick a value between them.
    min_similarity: float = float(os.getenv("MIN_SIMILARITY", "0"))
    # Rule-based understanding: page / file references become filters, "figure" / "table"
    # wording boosts those record types.
    query_understanding: bool = _env_flag("QUERY_UNDERSTANDING", True)

    # Corrective retry: if the best hit's cosine similarity is below this, search once more with a
    # hypothetical answer (HyDE). bge-m3 scores unrelated text around 0.42, so 0.5 is a starting
    # point; calibrate from the "best_similarity" values in the logs. 0 disables the retry.
    adaptive_retry: bool = _env_flag("ADAPTIVE_RETRY", True)
    retry_below_similarity: float = float(os.getenv("RETRY_BELOW_SIMILARITY", "0.5"))

    # Query processing.
    query_model: str = os.getenv("QUERY_MODEL", os.getenv("CHAT_MODEL", "qwen3:8b"))
    # "auto": rewrite only when there is conversation history or a long question;
    # "always" / "off" force it. Rewriting resolves follow-ups ("and its pressure?").
    query_rewrite: str = os.getenv("QUERY_REWRITE", "auto")
    query_decompose: bool = _env_flag("QUERY_DECOMPOSE", True)  # multi-part questions
    max_sub_queries: int = int(os.getenv("MAX_SUB_QUERIES", "3"))
    hyde: bool = _env_flag("HYDE", False)  # +1 LLM call per question; measure before enabling

    # Generation.
    chat_model: str = os.getenv("CHAT_MODEL", "qwen3:8b")
    site_name: str = os.getenv("SITE_NAME", "the Sphinx website")
    gen_num_ctx: int = int(os.getenv("GEN_NUM_CTX", "16384"))      # always set: Ollama trims silently
    gen_max_tokens: int = int(os.getenv("GEN_MAX_TOKENS", "700"))
    gen_temperature: float = float(os.getenv("GEN_TEMPERATURE", "0.1"))
    gen_max_sources: int = int(os.getenv("GEN_MAX_SOURCES", "6"))
    gen_context_share: float = float(os.getenv("GEN_CONTEXT_SHARE", "0.6"))  # of num_ctx for sources
    gen_attach_images: bool = _env_flag("GEN_ATTACH_IMAGES", False)  # needs a vision chat model
    max_turns: int = int(os.getenv("MAX_TURNS", "6"))
    max_message_chars: int = int(os.getenv("MAX_MESSAGE_CHARS", "4000"))
    answer_format: str = os.getenv("ANSWER_FORMAT", "plain")  # "plain" | "markdown"
    append_sources: bool = _env_flag("APPEND_SOURCES", True)   # sources footer inside "reply"
    strict_grounding: bool = _env_flag("STRICT_GROUNDING", False)  # refuse uncited answers
    not_found_reply: str = os.getenv(
        "NOT_FOUND_REPLY", "I couldn't find anything about that in the available documents.")
    # Thinking models (qwen3, ...): "false" for fast answers, "true" to reason first, "" to omit.
    llm_think: str = os.getenv("LLM_THINK", "false")

    ollama_keep_alive: str = os.getenv("OLLAMA_KEEP_ALIVE", "30m")


# ──────────────────────────────────────────────────────────────────────────────
# Dense embeddings (Ollama)
# ──────────────────────────────────────────────────────────────────────────────

def l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class OllamaEmbedder:
    """Batched /api/embed calls with retries. Vectors are L2-normalized for cosine search."""

    def __init__(self, s: Settings):
        self.s = s
        self._dim: int | None = None

    @property
    def model_id(self) -> str:
        return f"ollama/{self.s.embed_model}"

    @property
    def dim(self) -> int:
        if self._dim is None:
            self._dim = len(self._embed(["dimension probe"])[0])
        return self._dim

    def _embed(self, texts: list[str]) -> list[list[float]]:
        import ollama

        delay = 1.0
        for attempt in range(4):
            try:
                resp = ollama.embed(model=self.s.embed_model, input=texts,
                                    truncate=False,  # fail loudly instead of silently losing text
                                    keep_alive=self.s.ollama_keep_alive)
                vecs = resp["embeddings"]
                if len(vecs) != len(texts):
                    raise RuntimeError(f"expected {len(texts)} embeddings, got {len(vecs)}")
                return [l2_normalize(list(v)) for v in vecs]
            except Exception:
                if attempt == 3:
                    raise
                log.warning("embedding batch failed (attempt %d), retrying", attempt + 1, exc_info=True)
                time.sleep(delay)
                delay *= 2
        raise RuntimeError("unreachable")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        size = self.s.embed_batch_size
        for i in range(0, len(texts), size):
            out += self._embed([self.s.doc_prefix + t for t in texts[i:i + size]])
        return out

    def embed_query(self, text: str) -> list[float]:
        return self._embed([self.s.query_prefix + text])[0]

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return self._embed([self.s.query_prefix + t for t in texts]) if texts else []


# ──────────────────────────────────────────────────────────────────────────────
# Chat LLM (Ollama): used by query processing and answer generation
# ──────────────────────────────────────────────────────────────────────────────

THINK_RE = re.compile(r"<think>.*?</think>\s*", re.S)


class OllamaLLM:
    """Thin wrapper over ollama.chat with the settings production use needs:
    explicit num_ctx (Ollama otherwise trims long prompts silently), low temperature,
    output cap, optional JSON-schema constrained output, and thinking control."""

    def __init__(self, s: Settings):
        self.s = s
        self._think_supported: dict[str, bool] = {}

    def _think_arg(self, model: str) -> dict[str, Any]:
        raw = self.s.llm_think.strip().lower()
        if not raw or self._think_supported.get(model) is False:
            return {}
        return {"think": raw in {"1", "true", "yes", "on"}}

    def chat(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.0,
             num_ctx: int = 8192, max_tokens: int = 512, schema: dict | None = None,
             stream: bool = False):
        import ollama

        kwargs: dict[str, Any] = {
            "model": model, "messages": messages, "keep_alive": self.s.ollama_keep_alive,
            "options": {"temperature": temperature, "num_ctx": num_ctx, "num_predict": max_tokens},
        }
        if schema:
            kwargs["format"] = schema
        kwargs.update(self._think_arg(model))
        try:
            resp = ollama.chat(stream=stream, **kwargs)
        except ollama.ResponseError as exc:
            if "think" in kwargs and "think" in str(exc).lower():  # model has no thinking mode
                self._think_supported[model] = False
                kwargs.pop("think")
                resp = ollama.chat(stream=stream, **kwargs)
            else:
                raise
        if stream:
            return self._stream_text(resp)
        return THINK_RE.sub("", resp["message"]["content"]).strip()

    @staticmethod
    def _stream_text(chunks):
        in_think = False
        for chunk in chunks:
            text = chunk["message"]["content"] or ""
            if "<think>" in text:
                in_think = True
            if in_think:
                if "</think>" in text:
                    in_think = False
                    text = text.split("</think>", 1)[1]
                else:
                    continue
            if text:
                yield text


# ──────────────────────────────────────────────────────────────────────────────
# Sparse vectors (BM25)
# ──────────────────────────────────────────────────────────────────────────────

TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(unicodedata.normalize("NFKC", text))]


def _term_id(token: str) -> int:
    return int.from_bytes(hashlib.blake2b(token.encode(), digest_size=4).digest(), "little")


def bm25_document_vector(text: str, k1: float = 1.2, b: float = 0.75,
                         avgdl: float = 256.0) -> tuple[list[int], list[float]]:
    """BM25 term-frequency part; Qdrant applies IDF at query time (Modifier.IDF).

    Self-contained and offline. For better lexical recall (stemming, German compounds)
    swap in fastembed's "Qdrant/bm25", bge-m3 lexical weights or a SPLADE model, on both
    sides at once (this function and bm25_query_vector).
    """
    tokens = _tokens(text)
    dl = max(1, len(tokens))
    weights: dict[int, float] = {}
    for tok, tf in Counter(tokens).items():
        tid = _term_id(tok)
        weights[tid] = weights.get(tid, 0.0) + tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl))
    ids = sorted(weights)
    return ids, [weights[i] for i in ids]


def bm25_query_vector(text: str) -> tuple[list[int], list[float]]:
    ids = sorted({_term_id(t) for t in _tokens(text)})
    return ids, [1.0] * len(ids)


# ──────────────────────────────────────────────────────────────────────────────
# Vector store: connection and collection schema
# ──────────────────────────────────────────────────────────────────────────────

class QdrantStore:
    """Connection + schema. Writing lives in rag_ingest.IndexWriter, querying in rag_chat."""

    DENSE = "dense"
    SPARSE = "bm25"

    def __init__(self, s: Settings):
        from qdrant_client import QdrantClient

        self.s = s
        self.remote = bool(s.qdrant_url)
        self.client = (QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key, timeout=60)
                       if self.remote else QdrantClient(path=s.qdrant_path))
        self._checked_dim: int | None = None

    @property
    def collection(self) -> str:
        return self.s.collection

    def close(self) -> None:
        self.client.close()

    @staticmethod
    def match(key: str, value: Any):
        from qdrant_client import models as m

        if isinstance(value, (list, tuple, set)):
            return m.FieldCondition(key=key, match=m.MatchAny(any=list(value)))
        return m.FieldCondition(key=key, match=m.MatchValue(value=value))

    def tenant_filter(self, tenant: str | list[str], **extra: Any):
        """Every read and write is scoped to tenant(s); extra key=value pairs narrow it further."""
        from qdrant_client import models as m

        return m.Filter(must=[self.match("tenant_id", tenant),
                              *(self.match(k, v) for k, v in extra.items() if v not in (None, "", []))])

    def _dense_size(self) -> int:
        vectors = self.client.get_collection(self.collection).config.params.vectors
        return vectors[self.DENSE].size if isinstance(vectors, dict) else vectors.size

    def require_collection(self, dim: int) -> None:
        """For readers: the collection must exist and match the embedding model's dimension."""
        if self._checked_dim == dim:
            return
        if not self.client.collection_exists(self.collection):
            raise RuntimeError(f"Collection '{self.collection}' does not exist; ingest documents first.")
        size = self._dense_size()
        if size != dim:
            raise RuntimeError(
                f"Collection '{self.collection}' has {size}-d vectors but the model gives {dim}-d. "
                "Never mix embedding models in one collection: create a new versioned collection, "
                "re-index into it, then switch your alias.")
        self._checked_dim = dim

    PAYLOAD_INDEXES = {"doc_id": "keyword", "source_key": "keyword", "chunk_type": "keyword",
                       "file_name": "keyword", "page_start": "integer", "pages": "integer",
                       "chunk_index": "integer"}

    def ensure_payload_indexes(self) -> None:
        """Create any missing payload indexes (server only; the embedded mode ignores them)."""
        if not self.remote:
            return
        from qdrant_client import models as m

        existing = set((self.client.get_collection(self.collection).payload_schema or {}).keys())
        if "tenant_id" not in existing:
            self.client.create_payload_index(
                self.collection, "tenant_id",
                field_schema=m.KeywordIndexParams(type=m.KeywordIndexType.KEYWORD, is_tenant=True))
        kinds = {"keyword": m.PayloadSchemaType.KEYWORD, "integer": m.PayloadSchemaType.INTEGER}
        for fld, kind in self.PAYLOAD_INDEXES.items():
            if fld not in existing:
                self.client.create_payload_index(self.collection, fld, field_schema=kinds[kind])

    def ensure_collection(self, dim: int) -> None:
        """For the writer: create the collection with the shared schema, or validate it."""
        if self._checked_dim == dim:
            return
        if self.client.collection_exists(self.collection):
            self.require_collection(dim)
            self.ensure_payload_indexes()
            return

        from qdrant_client import models as m

        name = self.collection
        self.client.create_collection(
            collection_name=name,
            vectors_config={self.DENSE: m.VectorParams(size=dim, distance=m.Distance.COSINE,
                                                        on_disk=self.remote)},
            sparse_vectors_config={self.SPARSE: m.SparseVectorParams(modifier=m.Modifier.IDF)},
            # int8 quantization: ~4x less RAM for vectors; originals kept for rescoring.
            quantization_config=m.ScalarQuantization(
                scalar=m.ScalarQuantizationConfig(type=m.ScalarType.INT8, always_ram=True)
            ) if self.remote else None,
        )
        self.ensure_payload_indexes()
        self._checked_dim = dim