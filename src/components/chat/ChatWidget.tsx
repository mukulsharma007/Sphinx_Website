"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ChatMessage, { type Message } from "./ChatMessage";
import ChatInput from "./ChatInput";

const greeting: Message = {
  role: "assistant",
  content:
    "Hi — I'm Sphinx. Ask me anything about the product, pricing, or where to find things on this site.",
};

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking, open]);

  if (pathname === "/demo") return null;

  async function send(text: string) {
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data: { reply: string } = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            "I hit a snag reaching my brain — please try again, or head to /contact and a human will help.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat with Sphinx"
          className="fixed bottom-24 right-4 z-50 flex h-[min(32rem,70vh)]
                     w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden
                     rounded-xl border border-sand bg-bone shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-2 bg-night px-4 py-3 text-bone">
            <span aria-hidden className="text-xs text-gold">◆</span>
            <span className="display text-sm tracking-[0.18em]">SPHINX</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-bone/50">
              in training
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="ml-2 text-bone/60 transition-colors hover:text-bone"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
            {thinking && (
              <div className="mr-auto flex w-14 items-center justify-center gap-1 rounded-lg border border-sand bg-white px-3 py-3">
                <span className="typing-dot size-1.5 rounded-full bg-stone" />
                <span className="typing-dot size-1.5 rounded-full bg-stone" />
                <span className="typing-dot size-1.5 rounded-full bg-stone" />
              </div>
            )}
          </div>

          <ChatInput onSend={send} disabled={thinking} />
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Chat with Sphinx"}
        className="fixed bottom-6 right-4 z-50 grid size-14 place-items-center
                   rounded-full bg-night text-gold shadow-xl ring-1 ring-gold/30
                   transition-transform hover:scale-105"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <span aria-hidden className="text-lg">◆</span>
        )}
      </button>
    </>
  );
}
