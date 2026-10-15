import { runPythonScript } from "@/lib/python";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 5;
const SESSION_ID_RE = /^[0-9a-f-]{36}$/i;
const ALLOWED_EXTENSIONS = new Set([
  ".csv", ".css", ".docx", ".html", ".htm", ".ini", ".js", ".jsx", ".json",
  ".log", ".md", ".pdf", ".pptx", ".py", ".sql", ".toml", ".ts", ".tsx",
  ".txt", ".xml", ".yaml", ".yml", ".xlsx",
]);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TOTAL_SIZE + 1024 * 1024) {
    return Response.json({ error: "The total upload must be 20 MB or less." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Upload a valid multipart form." }, { status: 400 });
  }

  const sessionId = form.get("sessionId");
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    return Response.json({ error: "Invalid demo session." }, { status: 400 });
  }

  const entries = form.getAll("files");
  if (!entries.length || entries.length > MAX_FILES || entries.some((entry) => !(entry instanceof File))) {
    return Response.json({ error: `Choose between 1 and ${MAX_FILES} documents at a time.` }, { status: 400 });
  }

  let totalSize = 0;
  const files: Array<{ name: string; content: string }> = [];
  for (const entry of entries as File[]) {
    const name = pathSafeName(entry.name);
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return Response.json({ error: `${name} uses an unsupported file format.` }, { status: 415 });
    }
    if (entry.size === 0 || entry.size > MAX_FILE_SIZE) {
      return Response.json({ error: `${name} must be between 1 byte and 10 MB.` }, { status: 413 });
    }
    totalSize += entry.size;
    if (totalSize > MAX_TOTAL_SIZE) {
      return Response.json({ error: "The total upload must be 20 MB or less." }, { status: 413 });
    }
    files.push({ name, content: Buffer.from(await entry.arrayBuffer()).toString("base64") });
  }

  try {
    const result = await runPythonScript<{ files: string[]; chunks: number }>(
      "rag_ingest.py",
      { sessionId, files },
    );
    return Response.json(result);
  } catch (error) {
    console.error("[documents] Ingestion failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Document processing failed." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  let body: { sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid delete request." }, { status: 400 });
  }

  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    return Response.json({ error: "Invalid demo session." }, { status: 400 });
  }

  try {
    await runPythonScript<{ ok: boolean }>("rag_delete.py", { sessionId });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[documents] Deletion failed:", error);
    return Response.json(
      { error: "The documents could not be fully deleted. Please try again." },
      { status: 503 },
    );
  }
}

function pathSafeName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "document";
}
