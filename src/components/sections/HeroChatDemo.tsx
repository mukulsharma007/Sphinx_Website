"use client";

import { useEffect, useState } from "react";
import { linkify } from "@/lib/linkify";

/* The signature element of the site: the product demonstrating itself.
   A scripted conversation plays once on load — visitor asks, Sphinx answers
   with a real link. Respects prefers-reduced-motion (shows everything at once). */

type Msg = { role: "visitor" | "sphinx"; text: string };

const script: Msg[] = [
  { role: "visitor", text: "Do you integrate with HubSpot?" },
  {
    role: "sphinx",
    text: "Yes — every lead Sphinx captures is pushed straight into HubSpot with the full conversation attached. Setup details are at /product.",
  },
  { role: "visitor", text: "Nice. Where can I book a demo?" },
  {
    role: "sphinx",
    text: "Right this way: /contact — takes about a minute. Want me to note anything for the team before your call?",
  },
];

const STEP_MS = 1400;

export default function HeroChatDemo() {
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(script.length);
      return;
    }
    if (shown >= script.length) return;

    const isNextSphinx = script[shown].role === "sphinx";
    const t1 = setTimeout(() => setTyping(isNextSphinx), STEP_MS * 0.4);
    const t2 = setTimeout(() => {
      setTyping(false);
      setShown((n) => n + 1);
    }, STEP_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shown]);

  return (
    <div className="w-full max-w-md rounded-xl border border-bone/15 bg-ink/60 p-4 shadow-2xl backdrop-blur">
      {/* Widget header, exactly like the real one */}
      <div className="mb-3 flex items-center gap-2 border-b border-bone/10 pb-3">
        <span aria-hidden className="text-xs text-gold">◆</span>
        <span className="display text-sm tracking-[0.18em] text-bone">SPHINX</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-bone/50">
          <span className="size-1.5 rounded-full bg-gold" />
          live on this site
        </span>
      </div>

      <div className="space-y-3" aria-live="polite">
        {script.slice(0, shown).map((m, i) => (
          <div
            key={i}
            className={`fade-up max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === "visitor"
                ? "ml-auto bg-bone text-night"
                : "bg-night/80 text-bone/90 ring-1 ring-bone/10"
            }`}
          >
            {m.role === "sphinx" ? linkify(m.text) : m.text}
          </div>
        ))}

        {typing && (
          <div className="flex w-14 items-center justify-center gap-1 rounded-lg bg-night/80 px-3 py-3 ring-1 ring-bone/10">
            <span className="typing-dot size-1.5 rounded-full bg-bone/70" />
            <span className="typing-dot size-1.5 rounded-full bg-bone/70" />
            <span className="typing-dot size-1.5 rounded-full bg-bone/70" />
          </div>
        )}
      </div>
    </div>
  );
}
