"use client";

import { useState } from "react";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="border-t border-sand/70 bg-gradient-to-b from-white to-bone/40 p-3">
      <div className="rounded-2xl border border-sand bg-white/90 p-2 shadow-[0_8px_24px_rgba(20,20,20,0.06)] backdrop-blur-sm">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type your message…"
            aria-label="Ask Sphinx anything"
            disabled={disabled}
            rows={1}
            className="max-h-28 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6
                       text-ink placeholder:text-stone/70 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-night text-bone shadow-sm
                       transition-all duration-200 hover:-translate-y-0.5 hover:bg-night/90
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12l16-8-6 8 6 8-16-8z"
                fill="currentColor"
                fillRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-2 px-1 text-[11px] uppercase tracking-[0.2em] text-stone/80">
        Press Enter to send • Shift + Enter for a new line
      </p>
    </div>
  );
}
