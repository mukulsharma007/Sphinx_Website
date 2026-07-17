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
    <div className="border-t border-sand bg-white p-3">
      <div className="flex items-end gap-2 rounded-xl border border-sand bg-bone/60 p-2">
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
          className="max-h-28 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm
                     text-ink placeholder:text-stone/70 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-gold text-night
                     transition-colors hover:bg-gold-bright disabled:opacity-40"
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
      <p className="mt-2 px-1 text-[11px] uppercase tracking-[0.2em] text-stone">
        Press Enter to send • Shift + Enter for a new line
      </p>
    </div>
  );
}
