"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ChatMessage, { type Message } from "./ChatMessage";

type UploadedFile = { name: string; chunks: number };
type UploadResponse = { files: string[]; chunks: number; error?: string };
type ChatResponse = { reply?: string };

const ACCEPTED_FILES =
  ".csv,.css,.docx,.html,.htm,.ini,.js,.jsx,.json,.log,.md,.pdf,.pptx,.py,.sql,.toml,.ts,.tsx,.txt,.xml,.yaml,.yml,.xlsx";

const STARTER_PROMPTS = [
  "Summarize the key points",
  "What are the main findings?",
  "What should I know?",
];

export default function DemoChat() {
  const [sessionId, setSessionId] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to the Sphinx document demo. Upload your documents, then ask me anything about them. I’ll answer from your files and say when I can’t find something.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = window.localStorage.getItem("sphinx-demo-session");
    if (!id) {
      id = window.crypto.randomUUID();
      window.localStorage.setItem("sphinx-demo-session", id);
    }
    setSessionId(id);

    try {
      const savedFiles: UploadedFile[] = JSON.parse(
        window.localStorage.getItem(`sphinx-demo-files-${id}`) ?? "[]",
      );
      if (Array.isArray(savedFiles)) setFiles(savedFiles);
    } catch {
      window.localStorage.removeItem(`sphinx-demo-files-${id}`);
    }
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, thinking]);

  async function upload(selected: FileList | null) {
    if (!selected?.length || !sessionId || uploading || deleting) return;
    setError("");
    setUploading(true);

    const form = new FormData();
    form.set("sessionId", sessionId);
    Array.from(selected).forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data: UploadResponse = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The documents could not be processed.");

      const added = data.files.map((name) => ({ name, chunks: data.chunks }));
      setFiles((current) => {
        const updated = [...current, ...added];
        window.localStorage.setItem(`sphinx-demo-files-${sessionId}`, JSON.stringify(updated));
        return updated;
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I’ve added ${data.files.length} ${data.files.length === 1 ? "document" : "documents"} to your private demo knowledge base. Ask me a question whenever you’re ready.`,
        },
      ]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function send() {
    const text = question.trim();
    if (!text || !sessionId || thinking || uploading || deleting) return;
    if (!files.length) {
      setError("Upload at least one document before asking a question.");
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setQuestion("");
    setError("");
    setThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, sessionId }),
      });
      const data: ChatResponse = await response.json();
      if (!response.ok) throw new Error(data.reply ?? "The chat service is unavailable.");
      setMessages([...nextMessages, { role: "assistant", content: data.reply ?? "I couldn't generate a response." }]);
    } catch (chatError) {
      setMessages(nextMessages);
      setError(chatError instanceof Error ? chatError.message : "The chat request failed.");
    } finally {
      setThinking(false);
    }
  }

  async function deleteDocuments() {
    if (!sessionId || !files.length || uploading || thinking || deleting) return;
    const confirmed = window.confirm(
      "Delete all documents in this demo session, including their indexed embeddings and stored files? This cannot be undone.",
    );
    if (!confirmed) return;

    setError("");
    setDeleting(true);
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The documents could not be deleted.");

      setFiles([]);
      setQuestion("");
      setMessages([
        {
          role: "assistant",
          content:
            "Your documents and their indexed data have been deleted from this demo session. Upload new documents whenever you’re ready.",
        },
      ]);
      window.localStorage.removeItem(`sphinx-demo-files-${sessionId}`);
      if (inputRef.current) inputRef.current.value = "";
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The documents could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="bg-[#f7f8fa]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Document intelligence · interactive demo</p>
            <h1 className="display mt-3 text-3xl text-night sm:text-4xl">
              Your knowledge, in conversation.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone sm:text-base">
              Upload your files and get clear, grounded answers in seconds.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-xs font-medium text-emerald-800 shadow-sm">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Private demo session
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_35px_rgba(24,39,75,0.05)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Knowledge base</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {files.length ? `${files.length} ${files.length === 1 ? "document" : "documents"} added` : "Your source documents"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void deleteDocuments()}
                      disabled={uploading || thinking || deleting}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleting ? (
                        "Deleting…"
                      ) : (
                        <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M4.5 7h15m-13.5 0 .8 13h10.4L18 7M9 7V4.5h6V7m-5 3v6m4-6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Delete all
                        </>
                      )}
                    </button>
                  )}
                  <span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M7 3.75h6.5L19 9.25v10A1.75 1.75 0 0 1 17.25 21h-10A1.75 1.75 0 0 1 5.5 19.25v-13A2.5 2.5 0 0 1 8 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M13 4v5.5h5.5M8.5 14h7M8.5 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </div>

              <div className="p-4">
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILES}
                  onChange={(event) => void upload(event.target.files)}
                  className="sr-only"
                  id="document-upload"
                  aria-label="Choose documents to upload"
                  disabled={!sessionId || uploading || thinking || deleting}
                />
                <label
                  htmlFor="document-upload"
                  className={`group flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 ${
                    uploading || thinking || deleting ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200 transition-transform group-hover:-translate-y-0.5" aria-hidden>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                      <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="mt-3 text-sm font-semibold text-slate-800">
                    {uploading ? "Processing your files…" : "Add your documents"}
                  </span>
                  <span className="mt-1 text-xs leading-5 text-slate-500">
                    Browse files from your device
                  </span>
                </label>
                <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                  PDF, DOCX, PPTX, XLSX, TXT, CSV &amp; more<br />
                  Up to 10 MB per file · 20 MB total
                </p>
              </div>

              <div className="border-t border-slate-100 px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {files.length ? "Indexed sources" : "Your sources"}
                </p>
                {files.length ? (
                  <ul className="space-y-1.5" aria-label="Uploaded documents">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold uppercase text-slate-600" aria-hidden>
                          {file.name.split(".").pop()?.slice(0, 4) || "file"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" title={file.name}>
                          {file.name}
                        </span>
                        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Indexed" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                    Add a document to give Sphinx context for its answers.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4">
              <div className="flex gap-3">
                <span className="mt-0.5 text-indigo-600" aria-hidden>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3.5 5 6v5.2c0 4.3 2.9 7.8 7 9.3 4.1-1.5 7-5 7-9.3V6l-7-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-800">Your files stay private</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    This demo keeps your session separate from other visitors.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_50px_rgba(24,39,75,0.07)] lg:min-h-[700px]">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-amber-300 shadow-sm" aria-hidden>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" fill="currentColor" />
                    <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" fill="currentColor" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Sphinx assistant</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {files.length ? `Answering from ${files.length} ${files.length === 1 ? "source" : "sources"}` : "Grounded in your documents"}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Ready
              </span>
            </header>

            <div
              ref={messagesRef}
              role="log"
              aria-live="polite"
              className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
            >
              {messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                      message.role === "assistant"
                        ? "bg-slate-950 text-amber-300"
                        : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {message.role === "assistant" ? "✦" : "Y"}
                  </span>
                  <div className={`min-w-0 max-w-[calc(100%-2.75rem)] ${message.role === "user" ? "text-right" : ""}`}>
                    <p className="mb-1.5 px-1 text-[11px] font-semibold text-slate-500">
                      {message.role === "assistant" ? "Sphinx" : "You"}
                    </p>
                    <div className="text-left text-sm leading-7 text-slate-700">
                      <ChatMessage message={message} />
                    </div>
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="ml-11 flex items-center gap-1.5 py-2" aria-label="Sphinx is thinking">
                  <span className="typing-dot size-2 rounded-full bg-indigo-400" />
                  <span className="typing-dot size-2 rounded-full bg-indigo-400" />
                  <span className="typing-dot size-2 rounded-full bg-indigo-400" />
                  <span className="ml-1 text-xs text-slate-500">Sphinx is thinking</span>
                </div>
              )}
              {files.length > 0 && messages.length <= 2 && !thinking && (
                <div className="ml-11">
                  <p className="mb-2 text-xs font-medium text-slate-500">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setQuestion(prompt)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
              {error && (
                <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                  {error}
                </p>
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition-shadow focus-within:border-indigo-300 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={files.length ? "Ask a question about your documents…" : "Add a document to start a conversation"}
                  aria-label="Ask a question about your documents"
                  disabled={!sessionId || uploading || thinking || deleting}
                  rows={2}
                  className="max-h-40 min-h-12 w-full resize-y bg-transparent px-3 py-2 text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-2">
                  <p className="px-2 text-[11px] text-slate-400">
                    Enter to send · Shift + Enter for a new line
                  </p>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!question.trim() || !sessionId || uploading || thinking || deleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Send
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                AI responses can make mistakes. Check important details against your source documents.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
          <span>Interactive product demo</span>
          <Link href="/" className="font-medium text-slate-600 transition-colors hover:text-indigo-700">
            Back to Sphinx
          </Link>
        </div>
      </div>
    </section>
  );
}
