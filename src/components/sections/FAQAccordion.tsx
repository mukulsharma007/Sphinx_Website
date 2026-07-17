"use client";

import { useState } from "react";
import type { FAQItem } from "@/content/faq";

export default function FAQAccordion({ faqs }: { faqs: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-sand rounded-xl border border-sand bg-white">
      {faqs.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.question} className={open ? "border-l-2 border-l-gold" : ""}>
            <button
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={open}
              aria-controls={`faq-panel-${i}`}
              onClick={() => setOpenIndex(open ? null : i)}
            >
              <span className="text-sm font-medium text-ink md:text-base">
                {item.question}
              </span>
              <span
                aria-hidden
                className={`text-lg text-gold transition-transform duration-200 ${
                  open ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>

            {/* 0fr -> 1fr grid trick: smooth height animation without JS measuring */}
            <div
              id={`faq-panel-${i}`}
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-stone">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
