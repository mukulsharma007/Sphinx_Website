#!/usr/bin/env python3
"""
rag_ingest.py — production-oriented document ingestion for RAG.

Pipeline (one document at a time; a failure in one file never sinks the batch):

    validate ─► fingerprint ─► parse (layout-aware, OCR, table structure)
        ─► persist raw + parsed artifacts ─► enrich (tables, figures)
        ─► structure-aware, token-bounded chunking ─► contextualize
        ─► dense embeddings (batched) + BM25 sparse vectors
        ─► upsert into Qdrant (hybrid search, tenant isolation)

Why it is built this way
  * Docling parses PDF/DOCX/PPTX/XLSX/HTML/images with layout analysis, reading
    order, OCR for scanned pages and TableFormer for table structure. Page
    headers/footers land in a separate "furniture" layer and never reach chunks.
  * Chunks follow the document's structure (sections, lists, tables) and are
    bounded in tokens of the *embedding model's own tokenizer*, not characters.
  * Tables are chunked with their header row repeated, and also indexed as one
    record whose vector comes from caption + summary while the payload keeps the
    full Markdown table ("embed the summary, hand the LLM the table").
  * Figures are cropped and saved, then described by a vision-language model.
    The description is what gets embedded; the image path travels in the payload
    so a multimodal LLM can look at the real image at answer time.
  * IDs are deterministic, so re-ingesting the same file is a no-op; a new
    version of a file is inserted first and the old version deleted afterwards.
  * Every record carries page numbers, bounding boxes, heading path, Docling
    element refs and pipeline/model versions: that is what makes citations,
    filtering, debugging and re-indexing possible.
  * Dense + sparse (BM25) vectors live in one Qdrant collection; rag_chat.py
    fuses them with Reciprocal Rank Fusion at query time.

This module only writes to the index. Questions are answered by rag_chat.py; everything both
sides must agree on (settings, embedder, BM25, collection schema) lives in rag_common.py.

Usage
    python rag_ingest.py ingest --tenant acme report.pdf specs/*.docx
    # drop-in for the old script's stdin contract ({"sessionId", "files":[{name, content(b64)}]}),
    # with or without the "stdin" argument:
    cat payload.json | python rag_ingest.py

Configuration is via environment variables (see rag_common.Settings).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import logging
import math
import os
import re
import shutil
import sys
import time
import unicodedata
import uuid
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Protocol

from rag_common import (TENANT_RE, OllamaEmbedder, QdrantStore, Settings,
                        bm25_document_vector, configure_stdio, read_stdin_text, write_json)

log = logging.getLogger("rag_ingest")


# ──────────────────────────────────────────────────────────────────────────────
# Validation and type detection
# ──────────────────────────────────────────────────────────────────────────────

class IngestError(Exception):
    """A problem with one document that should be reported, not crash the batch."""


DOCLING_TYPES = {
    ".pdf": "pdf", ".docx": "docx", ".pptx": "pptx", ".xlsx": "xlsx",
    ".html": "html", ".htm": "html", ".md": "md", ".csv": "csv",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".tif": "image",
    ".tiff": "image", ".bmp": "image", ".webp": "image",
}
TEXT_TYPES = {".txt": "text", ".log": "text", ".rst": "text", ".ini": "code",
              ".toml": "code", ".yaml": "code", ".yml": "code", ".py": "code",
              ".js": "code", ".jsx": "code", ".ts": "code", ".tsx": "code",
              ".css": "code", ".sql": "code", ".json": "json", ".xml": "xml"}
OOXML_MARKER = {"docx": "word/document.xml", "pptx": "ppt/presentation.xml",
                "xlsx": "xl/workbook.xml"}
IMAGE_MAGIC = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"II*\x00", b"MM\x00*", b"BM", b"RIFF")


def detect_kind(name: str, content: bytes, s: Settings) -> str:
    """Return the document kind, checking content (magic bytes), not just the extension."""
    if not content:
        raise IngestError(f"{name} is empty.")
    if len(content) > s.max_file_bytes:
        raise IngestError(f"{name} exceeds the {s.max_file_bytes // 2**20} MB limit.")
    ext = Path(name).suffix.lower()
    kind = DOCLING_TYPES.get(ext) or TEXT_TYPES.get(ext)
    if kind is None:
        raise IngestError(f"{name}: unsupported file type '{ext}'.")

    if kind == "pdf" and b"%PDF-" not in content[:1024]:
        raise IngestError(f"{name} does not look like a PDF.")
    if kind in OOXML_MARKER:
        _check_ooxml(name, content, OOXML_MARKER[kind], s)
    if kind == "image" and not content.startswith(IMAGE_MAGIC):
        raise IngestError(f"{name} does not look like a supported image.")
    if kind in {"text", "code", "json", "xml", "md", "csv", "html"} and b"\x00" in content[:8192]:
        raise IngestError(f"{name} contains binary data but has a text extension.")
    return kind


def _check_ooxml(name: str, content: bytes, marker: str, s: Settings) -> None:
    """Office files are zip archives: verify structure and guard against zip bombs."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            infos = zf.infolist()
            names = {i.filename for i in infos}
            total = sum(i.file_size for i in infos)
    except zipfile.BadZipFile as exc:
        raise IngestError(f"{name} is not a valid Office file.") from exc
    if marker not in names:
        raise IngestError(f"{name} is missing {marker}; wrong extension or corrupt file.")
    if total > s.max_file_bytes * 5 or total > len(content) * s.max_zip_ratio:
        raise IngestError(f"{name} expands to {total // 2**20} MB; refusing (possible zip bomb).")


def decode_text(content: bytes) -> tuple[str, list[str]]:
    try:
        return content.decode("utf-8-sig"), []
    except UnicodeDecodeError:
        return content.decode("utf-8", errors="replace"), ["Not valid UTF-8; undecodable bytes were replaced."]


def pdf_needs_full_ocr(content: bytes, sample_pages: int = 12) -> bool:
    """Cheap triage: scanned PDFs (no text layer) or broken text layers get full-page OCR."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        n = len(reader.pages)
        if n == 0:
            return False
        step = max(1, n // sample_pages)
        texts = [(reader.pages[i].extract_text() or "") for i in range(0, n, step)][:sample_pages]
    except Exception:  # unreadable text layer: let OCR handle it
        return True
    joined = "".join(texts)
    chars_per_page = len(joined.strip()) / max(1, len(texts))
    if chars_per_page < 40:
        return True
    # "(cid:123)" sequences and replacement chars mean a font without a usable ToUnicode map.
    garbage = joined.count("(cid:") * 6 + joined.count("�")
    return garbage / max(1, len(joined)) > 0.05


# ──────────────────────────────────────────────────────────────────────────────
# Parsing
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ParseResult:
    doc: Any                      # docling_core DoclingDocument
    parser: str
    warnings: list[str] = field(default_factory=list)
    quality: dict[str, Any] = field(default_factory=dict)
    full_ocr: bool = False
    complete: bool = True          # False when some pages failed or the timeout cut parsing short


class DoclingParser:
    """Layout-aware parsing. Converters are heavy (they load models), so build each once."""

    def __init__(self, s: Settings):
        self.s = s
        self._converters: dict[bool, Any] = {}

    def _converter(self, full_ocr: bool):
        if full_ocr not in self._converters:
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
            from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

            opts = PdfPipelineOptions()
            opts.do_ocr = True                        # OCR bitmap regions (scans, images of text)
            opts.ocr_options.force_full_page_ocr = full_ocr
            opts.do_table_structure = True            # TableFormer: rows, columns, spans
            opts.table_structure_options.mode = TableFormerMode.ACCURATE
            opts.table_structure_options.do_cell_matching = True
            opts.generate_picture_images = True       # keep figure crops for the VLM step
            opts.images_scale = 2.0                   # ~144 dpi crops: legible for VLMs
            opts.document_timeout = self.s.parse_timeout_s
            self._converters[full_ocr] = DocumentConverter(format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=opts),
                InputFormat.IMAGE: ImageFormatOption(pipeline_options=opts),
            })
        return self._converters[full_ocr]

    def parse(self, name: str, content: bytes, kind: str) -> ParseResult:
        if kind in {"text", "code", "json", "xml"}:
            return self._parse_plain(name, content, kind)

        from docling.datamodel.base_models import ConversionStatus, DocumentStream

        full_ocr = kind == "pdf" and pdf_needs_full_ocr(content)
        result = self._converter(full_ocr).convert(
            DocumentStream(name=name, stream=io.BytesIO(content)),
            raises_on_error=False,
            max_num_pages=self.s.max_pages,
            max_file_size=self.s.max_file_bytes,
        )
        warnings = [f"{getattr(e, 'component_type', '')}: {getattr(e, 'error_message', e)}"
                    for e in (result.errors or [])]
        if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            raise IngestError(f"{name}: parsing failed ({result.status}). {'; '.join(warnings)[:500]}")
        if result.status == ConversionStatus.PARTIAL_SUCCESS:
            warnings.insert(0, "Partial conversion: some pages failed or the parse timeout was hit "
                               "(raise PARSE_TIMEOUT_S for long documents). Indexed what was parsed; "
                               "re-ingesting will try again.")
        return ParseResult(doc=result.document, parser=f"docling/{_pkg_version('docling')}",
                           warnings=warnings, quality=_quality(result), full_ocr=full_ocr,
                           complete=result.status == ConversionStatus.SUCCESS)

    @staticmethod
    def _parse_plain(name: str, content: bytes, kind: str) -> ParseResult:
        from docling_core.types.doc import DocItemLabel, DoclingDocument

        text, warnings = decode_text(content)
        if kind == "json":
            try:
                text = json.dumps(json.loads(text), ensure_ascii=False, indent=2)
            except json.JSONDecodeError as exc:
                raise IngestError(f"{name}: invalid JSON ({exc}).") from exc
        elif kind == "xml":
            import defusedxml.ElementTree as DET  # stdlib ElementTree is unsafe on untrusted XML

            try:
                root = DET.fromstring(content)
            except Exception as exc:
                raise IngestError(f"{name}: invalid or unsafe XML ({exc}).") from exc
            text = "\n".join(t.strip() for t in root.itertext() if t.strip())

        doc = DoclingDocument(name=Path(name).stem)
        if kind in {"code", "json"}:
            doc.add_code(text=text)
        else:
            for block in re.split(r"\n\s*\n", text):
                if block.strip():
                    doc.add_text(label=DocItemLabel.PARAGRAPH, text=block.strip())
        return ParseResult(doc=doc, parser="plain", warnings=warnings)


def _quality(result: Any) -> dict[str, Any]:
    conf = getattr(result, "confidence", None)
    if conf is None:
        return {}
    out: dict[str, Any] = {}
    for key in ("mean_grade", "low_grade", "parse_score", "layout_score", "table_score", "ocr_score"):
        val = getattr(conf, key, None)
        if val is None:
            continue
        if isinstance(val, float):
            if not math.isnan(val):
                out[key] = round(val, 3)
        else:
            text = str(getattr(val, "value", val))
            if text.lower() != "unspecified":
                out[key] = text
    return out


def _pkg_version(pkg: str) -> str:
    try:
        from importlib.metadata import version

        return version(pkg)
    except Exception:
        return "unknown"


# ──────────────────────────────────────────────────────────────────────────────
# Document structure helpers
# ──────────────────────────────────────────────────────────────────────────────

def heading_paths(doc: Any) -> dict[str, list[str]]:
    """Map every body element to its heading breadcrumb (title > section > subsection)."""
    from docling_core.types.doc import DocItemLabel

    paths: dict[str, list[str]] = {}
    stack: list[tuple[int, str]] = []
    for item, _ in doc.iterate_items():
        label = getattr(item, "label", None)
        if label == DocItemLabel.TITLE:
            stack = [(0, item.text.strip())]
            continue
        if label == DocItemLabel.SECTION_HEADER:
            level = int(getattr(item, "level", 1) or 1)
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, item.text.strip()))
            continue
        paths[item.self_ref] = [t for _, t in stack]
    return paths


def doc_title(doc: Any, fallback: str) -> str:
    from docling_core.types.doc import DocItemLabel

    for item, _ in doc.iterate_items():
        if getattr(item, "label", None) == DocItemLabel.TITLE and item.text.strip():
            return item.text.strip()
    return fallback


def provenance(items: Iterable[Any]) -> tuple[list[int], list[dict[str, Any]]]:
    pages: set[int] = set()
    boxes: list[dict[str, Any]] = []
    for it in items:
        for p in getattr(it, "prov", None) or []:
            pages.add(p.page_no)
            b = p.bbox
            boxes.append({"page": p.page_no, "l": round(b.l, 1), "t": round(b.t, 1),
                          "r": round(b.r, 1), "b": round(b.b, 1),
                          "origin": str(getattr(b.coord_origin, "value", b.coord_origin))})
    return sorted(pages), boxes[:20]


def normalize_for_embedding(text: str) -> str:
    """NFKC (ligatures, full-width chars) + whitespace cleanup that keeps line structure."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compose_embed_text(title: str, headings: list[str], body: str, context: str = "") -> str:
    heads = [h for h in headings if h and h != title]
    parts = [f"Document: {title}"]
    if heads:
        parts.append("Section: " + " > ".join(heads))
    if context:
        parts.append(f"Context: {context}")
    parts += ["", body]
    return normalize_for_embedding("\n".join(parts))


def fit_tokens(text: str, tokenizer: Any, max_tokens: int) -> str:
    """Trim text so it fits the embedding model; never rely on silent server-side truncation."""
    if tokenizer.count_tokens(text) <= max_tokens:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if tokenizer.count_tokens(text[:mid]) <= max_tokens:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo]


# ──────────────────────────────────────────────────────────────────────────────
# Enrichment (LLM / VLM via Ollama)
# ──────────────────────────────────────────────────────────────────────────────

class Enricher(Protocol):
    def summarize_table(self, markdown: str, caption: str, title: str, headings: list[str]) -> str: ...
    def describe_figure(self, png: bytes, caption: str, title: str, headings: list[str], inner_text: str) -> str: ...
    def situate_chunk(self, doc_text: str, chunk: str) -> str: ...


class OllamaEnricher:
    def __init__(self, s: Settings):
        self.s = s

    def _chat(self, prompt: str, image_png: bytes | None = None) -> str:
        import ollama

        message: dict[str, Any] = {"role": "user", "content": prompt}
        if image_png:
            message["images"] = [image_png]
        resp = ollama.chat(model=self.s.enrich_model, messages=[message],
                           options={"temperature": 0, "num_ctx": self.s.enrich_num_ctx, "num_predict": 400},
                           keep_alive=self.s.ollama_keep_alive)
        return resp["message"]["content"].strip()

    def summarize_table(self, markdown: str, caption: str, title: str, headings: list[str]) -> str:
        return self._chat(
            "You write search-index summaries of tables from documents.\n"
            f"Document: {title}\nSection: {' > '.join(headings) or '-'}\nCaption: {caption or '-'}\n\n"
            f"{markdown[:8000]}\n\n"
            "In at most 120 words, state what the table is about, what its rows and columns "
            "represent (with units), and the most notable values or trends. Use only numbers "
            "that appear in the table. Write in the document's language. Output only the summary."
        )

    def describe_figure(self, png: bytes, caption: str, title: str, headings: list[str], inner_text: str) -> str:
        return self._chat(
            "You describe figures from documents so they can be found by text search.\n"
            f"Document: {title}\nSection: {' > '.join(headings) or '-'}\nCaption: {caption or '-'}\n"
            f"Text detected inside the figure: {inner_text[:1500] or '-'}\n\n"
            "Describe the image factually in at most 200 words: the kind of figure (chart, "
            "diagram, schematic, photo, screenshot...), what it shows, all legible labels, axis "
            "titles, units, legend entries, and key values or trends. Do not guess beyond what is "
            "visible. Write in the document's language. Output only the description.",
            image_png=png,
        )

    def situate_chunk(self, doc_text: str, chunk: str) -> str:
        # Document first, chunk last: the identical prefix lets the server reuse its prompt cache.
        return self._chat(
            f"<document>\n{doc_text}\n</document>\n\n"
            f"<chunk>\n{chunk}\n</chunk>\n\n"
            "In one or two sentences, explain where this chunk sits in the document and what it is "
            "about, naming the entities it refers to, so the chunk can be retrieved on its own. "
            "Output only those sentences."
        )


# ──────────────────────────────────────────────────────────────────────────────
# Records: what gets indexed
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Record:
    kind: str                 # "text" | "table" | "figure"
    text: str                 # what the LLM reads at answer time
    embed_text: str           # what retrieval matches against (dense + sparse)
    meta: dict[str, Any]


class RecordBuilder:
    def __init__(self, s: Settings, tokenizer: Any, enricher: Enricher | None):
        self.s = s
        self.tokenizer = tokenizer
        self.enricher = enricher

    def build(self, doc: Any, title: str, figure_dir: Path, warnings: list[str]) -> list[Record]:
        paths = heading_paths(doc)
        records = self._text_chunks(doc, title, warnings)
        records += self._tables(doc, title, paths, warnings)
        records += self._figures(doc, title, paths, figure_dir, warnings)

        # Exact-duplicate removal (repeated disclaimers, boilerplate blocks).
        seen: set[str] = set()
        unique: list[Record] = []
        for r in records:
            key = hashlib.sha1(r.embed_text.encode()).hexdigest()
            if key not in seen:
                seen.add(key)
                unique.append(r)
        return unique

    # Structure-aware chunks: Docling's HybridChunker splits along the document
    # hierarchy, merges small siblings and splits oversize items, all measured in
    # tokens of the embedding model. Tables are serialized as Markdown with the
    # header row repeated in every chunk the table is split into.
    def _chunker(self):
        from docling_core.transforms.chunker.hierarchical_chunker import (
            ChunkingDocSerializer, ChunkingSerializerProvider)
        from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
        from docling_core.transforms.serializer.markdown import MarkdownParams, MarkdownTableSerializer

        class MarkdownTables(ChunkingSerializerProvider):
            def get_serializer(self, doc):
                return ChunkingDocSerializer(doc=doc, table_serializer=MarkdownTableSerializer(),
                                             params=MarkdownParams(compact_tables=True, image_placeholder="",
                                                                   # keep raw text: "max_pressure", "a < b";
                                                                   # the generator escapes source tags itself
                                                                   escape_html=False, escape_underscores=False))

        return HybridChunker(tokenizer=self.tokenizer, merge_peers=True,
                             repeat_table_header=True, serializer_provider=MarkdownTables())

    def _text_chunks(self, doc: Any, title: str, warnings: list[str]) -> list[Record]:
        from docling_core.types.doc import DocItemLabel

        doc_text = ""
        if self.s.contextual_chunks and self.enricher:
            doc_text = doc.export_to_markdown()[: self.s.context_doc_chars]

        # caption element -> the table/figure it belongs to
        caption_owner = {cap.cref: obj.self_ref
                         for obj in [*doc.tables, *doc.pictures] for cap in (obj.captions or [])}
        anchor_labels = (DocItemLabel.TABLE, DocItemLabel.PICTURE)

        records: list[Record] = []
        for chunk in self._chunker().chunk(dl_doc=doc):
            body = chunk.text.strip()
            if not body:
                continue
            items = chunk.meta.doc_items or []
            labels = sorted({str(getattr(i.label, "value", i.label)) for i in items})
            # A chunk that is nothing but one table/figure (+ its caption) is grouped with that
            # table's/figure's own record, so search returns it once.
            owners = {i.self_ref for i in items if i.label in anchor_labels}
            owners |= {caption_owner[i.self_ref] for i in items if i.self_ref in caption_owner}
            standalone = len(owners) == 1 and all(
                i.label in anchor_labels or i.self_ref in caption_owner for i in items)
            owner = next(iter(owners)) if standalone else None
            pages, boxes = provenance(items)
            headings = list(chunk.meta.headings or [])

            context = ""
            if doc_text:
                try:
                    context = self.enricher.situate_chunk(doc_text, body)
                except Exception as exc:
                    warnings.append(f"contextualization failed: {exc}")

            records.append(Record(
                kind=("table" if "/tables/" in owner else "figure") if owner else "text",
                text=body,
                embed_text=fit_tokens(compose_embed_text(title, headings, body, context),
                                      self.tokenizer, self.s.embed_max_tokens),
                meta={"headings": headings, "pages": pages, "bboxes": boxes,
                      "element_refs": [i.self_ref for i in items][:50], "labels": labels,
                      # a chunk that is only (part of) one table groups with that table's record
                      "group_key": owner,
                      "context": context},
            ))
        return records

    def _tables(self, doc: Any, title: str, paths: dict[str, list[str]], warnings: list[str]) -> list[Record]:
        records: list[Record] = []
        for table in doc.tables:
            markdown = table.export_to_markdown(doc=doc).strip()
            if not markdown:
                continue
            caption = table.caption_text(doc).strip()
            headings = paths.get(table.self_ref, [])
            summary = ""
            if self.s.summarize_tables and self.enricher:
                try:
                    summary = self.enricher.summarize_table(markdown, caption, title, headings)
                except Exception as exc:
                    warnings.append(f"table summary failed ({table.self_ref}): {exc}")
            head_rows = "\n".join(markdown.splitlines()[:6])  # header + first rows
            body = "\n".join(x for x in [caption or "Table", summary, head_rows] if x)
            pages, boxes = provenance([table])
            df = None
            try:
                df = table.export_to_dataframe(doc=doc)
            except TypeError:
                df = table.export_to_dataframe()
            except Exception:
                pass
            records.append(Record(
                kind="table",
                text=markdown if not caption or caption in markdown else f"{caption}\n\n{markdown}",
                embed_text=fit_tokens(compose_embed_text(title, headings, body),
                                      self.tokenizer, self.s.embed_max_tokens),
                meta={"headings": headings, "pages": pages, "bboxes": boxes,
                      "element_refs": [table.self_ref], "labels": ["table"],
                      "group_key": table.self_ref, "caption": caption, "summary": summary,
                      "table_markdown": markdown,
                      "table_shape": list(df.shape) if df is not None else None},
            ))
        return records

    def _figures(self, doc: Any, title: str, paths: dict[str, list[str]], figure_dir: Path,
                 warnings: list[str]) -> list[Record]:
        records: list[Record] = []
        for idx, pic in enumerate(doc.pictures):
            caption = pic.caption_text(doc).strip()
            image = pic.get_image(doc)
            if image is None and not caption:
                continue
            if image is not None and min(image.size) < self.s.min_figure_px and not caption:
                continue  # icons, logos, bullets, decorative rules

            # Text Docling OCR'd inside the figure (axis labels, callouts).
            inner = []
            for child in getattr(pic, "children", []) or []:
                node = child.resolve(doc)
                if getattr(node, "text", ""):
                    inner.append(node.text.strip())
            inner_text = " ".join(inner)

            png, image_uri = None, None
            if image is not None:
                figure_dir.mkdir(parents=True, exist_ok=True)
                path = figure_dir / f"figure_{idx:04d}.png"
                image.save(path, format="PNG")
                image_uri = str(path)
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                png = buf.getvalue()

            headings = paths.get(pic.self_ref, [])
            description = ""
            if png and self.s.describe_figures and self.enricher:
                try:
                    description = self.enricher.describe_figure(png, caption, title, headings, inner_text)
                except Exception as exc:
                    warnings.append(f"figure description failed ({pic.self_ref}): {exc}")

            body = "\n".join(x for x in [
                caption or "Figure",
                description,
                f"Text in figure: {inner_text}" if inner_text else "",
            ] if x)
            if body == "Figure":
                continue  # nothing searchable
            pages, boxes = provenance([pic])
            records.append(Record(
                kind="figure", text=body,
                embed_text=fit_tokens(compose_embed_text(title, headings, body),
                                      self.tokenizer, self.s.embed_max_tokens),
                meta={"headings": headings, "pages": pages, "bboxes": boxes,
                      "element_refs": [pic.self_ref], "labels": ["picture"],
                      "group_key": pic.self_ref, "caption": caption,
                      "image_uri": image_uri, "description": description},
            ))
        return records


# ──────────────────────────────────────────────────────────────────────────────
# Index writer: the ingestion-only operations on the shared store
# ──────────────────────────────────────────────────────────────────────────────

class IndexWriter(QdrantStore):
    def is_indexed(self, tenant: str, doc_id: str, pipeline_version: str, embed_model: str) -> bool:
        """True if this exact source + content was already indexed by this pipeline and model."""
        points, _ = self.client.scroll(
            self.collection, limit=1, with_payload=False,
            scroll_filter=self.tenant_filter(tenant, doc_id=doc_id, pipeline_version=pipeline_version,
                                             embed_model=embed_model, parse_complete=True))
        return bool(points)

    def doc_ids_for_source(self, tenant: str, source_key: str) -> set[str]:
        flt = self.tenant_filter(tenant, source_key=source_key)
        ids: set[str] = set()
        offset = None
        while True:
            points, offset = self.client.scroll(self.collection, scroll_filter=flt, limit=1000,
                                                offset=offset, with_payload=["doc_id"])
            ids.update(p.payload["doc_id"] for p in points)
            if offset is None:
                return ids

    def upsert(self, points: list[Any], batch: int = 128) -> None:
        for i in range(0, len(points), batch):
            self.client.upsert(self.collection, points=points[i:i + batch], wait=True)

    def delete_stale(self, tenant: str, source_key: str, doc_id: str, pipeline_version: str) -> None:
        """After the new version is in, remove older versions of the same source."""
        from qdrant_client import models as m

        flt = self.tenant_filter(tenant, source_key=source_key)
        flt.should = [  # at least one: different content, or produced by an older pipeline
            m.Filter(must_not=[self.match("doc_id", doc_id)]),
            m.Filter(must_not=[self.match("pipeline_version", pipeline_version)]),
        ]
        self.client.delete(self.collection, points_selector=m.FilterSelector(filter=flt), wait=True)


# ──────────────────────────────────────────────────────────────────────────────
# Pipeline
# ──────────────────────────────────────────────────────────────────────────────

ID_NAMESPACE = uuid.UUID("6f1c3a2e-9b7d-4d4e-8a51-2c0f4b1e7a90")


class IngestionPipeline:
    def __init__(self, s: Settings | None = None, *, parser: Any = None, embedder: Any = None,
                 enricher: Enricher | None = None, tokenizer: Any = None, store: Any = None):
        self.s = s or Settings()
        self.parser = parser or DoclingParser(self.s)
        self.embedder = embedder or OllamaEmbedder(self.s)
        self.enricher = enricher if enricher is not None else OllamaEnricher(self.s)
        self.tokenizer = tokenizer or self._load_tokenizer()
        self.store = store or IndexWriter(self.s)

    def _load_tokenizer(self):
        from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
        from transformers import AutoTokenizer

        return HuggingFaceTokenizer(tokenizer=AutoTokenizer.from_pretrained(self.s.tokenizer_id),
                                    max_tokens=self.s.max_chunk_tokens)

    def ingest(self, name: str, content: bytes, tenant_id: str, source_uri: str | None = None) -> dict[str, Any]:
        name = Path(name).name
        report: dict[str, Any] = {"file": name, "status": "failed", "warnings": []}
        started = time.perf_counter()
        try:
            if not TENANT_RE.fullmatch(tenant_id):
                raise IngestError("Invalid tenant id.")
            kind = detect_kind(name, content, self.s)
            sha256 = hashlib.sha256(content).hexdigest()
            source_key = source_uri or f"{tenant_id}/{name}"
            # One doc_id per (source, content). Identical files under different names are kept
            # separately (deleting one must not delete the other); search collapses their hits.
            doc_id = str(uuid.uuid5(ID_NAMESPACE, f"{tenant_id}:{source_key}:{sha256}"))
            report.update(doc_id=doc_id, sha256=sha256)

            self.store.ensure_collection(self.embedder.dim)
            if self.store.is_indexed(tenant_id, doc_id, self.s.pipeline_version, self.embedder.model_id):
                report.update(status="skipped", reason="unchanged since last ingestion")
                return report

            parsed = self.parser.parse(name, content, kind)
            warnings = report["warnings"]
            warnings += parsed.warnings

            art_dir = self.s.artifact_dir / tenant_id / doc_id
            art_dir.mkdir(parents=True, exist_ok=True)
            (art_dir / f"source{Path(name).suffix.lower()}").write_bytes(content)
            self._save_docling(parsed.doc, art_dir / "docling.json", warnings)

            title = doc_title(parsed.doc, Path(name).stem)
            records = RecordBuilder(self.s, self.tokenizer, self.enricher).build(
                parsed.doc, title, art_dir / "figures", warnings)
            if not records:
                raise IngestError(f"No readable content found in {name}.")

            pages = parsed.doc.num_pages() if hasattr(parsed.doc, "num_pages") else 0
            covered = {p for r in records for p in r.meta.get("pages", [])}
            if pages and len(covered) < 0.5 * pages:
                warnings.append(f"Only {len(covered)}/{pages} pages produced content; check parse quality.")

            points = self._to_points(records, tenant_id=tenant_id, doc_id=doc_id, sha256=sha256,
                                     source_key=source_key, file_name=name, title=title,
                                     parser=parsed.parser, quality=parsed.quality,
                                     complete=parsed.complete)
            # Insert-then-delete: the old version stays searchable until the new one is in.
            previous = self.store.doc_ids_for_source(tenant_id, source_key) - {doc_id}
            self.store.upsert(points)
            self.store.delete_stale(tenant_id, source_key, doc_id, self.s.pipeline_version)
            for old in previous:
                shutil.rmtree(self.s.artifact_dir / tenant_id / old, ignore_errors=True)
            if previous:
                report["replaced_versions"] = len(previous)

            report.update(
                status="ingested" if parsed.complete else "partial", title=title, pages=pages,
                full_page_ocr=parsed.full_ocr,
                records=len(records), quality=parsed.quality,
                by_kind=dict(Counter(r.kind for r in records)),
            )
        except IngestError as exc:
            report["error"] = str(exc)
        except Exception as exc:  # unexpected: keep the traceback in logs, not in the API response
            log.exception("ingestion failed for %s", name)
            report["error"] = f"Internal error while processing {name}: {type(exc).__name__}"
        finally:
            report["seconds"] = round(time.perf_counter() - started, 2)
        return report

    @staticmethod
    def _save_docling(doc: Any, path: Path, warnings: list[str]) -> None:
        """Lossless parse output: lets you re-chunk / re-embed later without re-parsing."""
        try:
            from docling_core.types.doc import ImageRefMode

            doc.save_as_json(path, artifacts_dir=path.parent / "docling_images",
                             image_mode=ImageRefMode.REFERENCED)
        except Exception as exc:
            warnings.append(f"could not persist parsed document: {exc}")

    def _to_points(self, records: list[Record], **doc: Any) -> list[Any]:
        from qdrant_client import models as m

        vectors = self.embedder.embed_documents([r.embed_text for r in records])
        now = datetime.now(timezone.utc).isoformat()
        points = []
        for idx, (rec, vec) in enumerate(zip(records, vectors)):
            point_id = str(uuid.uuid5(ID_NAMESPACE, f"{doc['doc_id']}:{idx}"))
            pages = rec.meta.get("pages") or []
            sparse = bm25_document_vector(rec.embed_text)
            payload = {
                "tenant_id": doc["tenant_id"], "doc_id": doc["doc_id"], "doc_sha256": doc["sha256"],
                "source_key": doc["source_key"], "file_name": doc["file_name"], "title": doc["title"],
                "chunk_index": idx, "chunk_type": rec.kind, "text": rec.text, "embed_text": rec.embed_text,
                "page_start": pages[0] if pages else None, "page_end": pages[-1] if pages else None,
                **{k: v for k, v in rec.meta.items() if v not in (None, "", [])},
                # content-based: identical files under different names collapse at search time
                "group_key": f"{doc['sha256']}:{rec.meta.get('group_key') or idx}",
                "parser": doc["parser"], "parse_quality": doc["quality"], "parse_complete": doc["complete"],
                "embed_model": self.embedder.model_id, "pipeline_version": self.s.pipeline_version,
                "ingested_at": now,
            }
            points.append(m.PointStruct(
                id=point_id, payload=payload,
                vector={QdrantStore.DENSE: vec,
                        QdrantStore.SPARSE: m.SparseVector(indices=sparse[0], values=sparse[1])},
            ))
        return points


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def _cmd_stdin(raw: str, pipe_factory=None) -> int:
    """The old script's contract: {"sessionId": uuid, "files": [{"name", "content"(b64)}]} on stdin,
    a JSON summary on stdout, errors on stderr, exit code 1 if anything failed."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print("Invalid request: stdin is not valid JSON.", file=sys.stderr)
        return 1
    session_id = payload.get("sessionId") if isinstance(payload, dict) else None
    if not isinstance(session_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", session_id, re.I):
        print("Invalid demo session.", file=sys.stderr)
        return 1
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        print("No readable documents were provided.", file=sys.stderr)
        return 1

    # Build the pipeline only after stdin is fully read: if startup fails (missing package,
    # model download, index locked by another process) the caller gets the real error on
    # stderr instead of a broken pipe ("write EOF") while still sending the upload.
    try:
        pipe = (pipe_factory or IngestionPipeline)()
    except Exception as exc:
        log.exception("could not start the ingestion pipeline")
        print(f"Ingestion service unavailable: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    reports = []
    try:
        for item in files:
            name = item.get("name") if isinstance(item, dict) else None
            try:
                content = base64.b64decode(item["content"], validate=True)
            except Exception:
                reports.append({"file": name, "status": "failed", "error": "Invalid file payload."})
                continue
            reports.append(pipe.ingest(str(name or "upload"), content, tenant_id=session_id))
    finally:
        pipe.store.close()

    ok = [r for r in reports if r["status"] in {"ingested", "partial", "skipped"}]
    write_json({"files": sorted(r["file"] for r in ok),
                "chunks": sum(r.get("records", 0) for r in ok),
                "reports": reports})
    failed = [r for r in reports if r["status"] == "failed"]
    for r in failed:
        print(f"{r['file']}: {r.get('error')}", file=sys.stderr)
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    configure_stdio()
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), stream=sys.stderr,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    import warnings
    warnings.filterwarnings("ignore", message="(Mean of empty slice|All-NaN slice)")  # docling scores on non-PDF

    argv = sys.argv[1:] if argv is None else argv
    if not argv:  # called like the old script (no arguments, JSON on stdin)
        argv = ["stdin"]
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_ing = sub.add_parser("ingest", help="ingest files")
    p_ing.add_argument("--tenant", required=True)
    p_ing.add_argument("files", nargs="+", type=Path)
    sub.add_parser("stdin", help="old stdin JSON contract (the default with no arguments)")
    args = ap.parse_args(argv)

    if args.cmd == "stdin":
        return _cmd_stdin(read_stdin_text())

    pipe = IngestionPipeline()
    try:
        reports = [pipe.ingest(f.name, f.read_bytes(), args.tenant, source_uri=str(f.resolve()))
                   for f in args.files]
        print(json.dumps(reports, ensure_ascii=False, indent=2))
        return 0 if all(r["status"] != "failed" for r in reports) else 1
    finally:
        pipe.store.close()


if __name__ == "__main__":
    sys.exit(main())