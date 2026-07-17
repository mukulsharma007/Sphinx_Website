import type { Metadata } from "next";
import ContactForm from "@/components/sections/ContactForm";

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "Request a Sphinx demo or pilot. We reply within one business day.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
      <div className="grid gap-14 md:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="eyebrow">Contact</p>
          <h1 className="display mt-4 text-4xl text-night md:text-5xl">
            See Sphinx on your own content.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone">
            Tell us about your site and what your customers keep asking. We set
            up a pilot trained on your real content — you judge the answers
            yourself.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink">
            {[
              "Pilot set up within a week",
              "No engineering effort on your side",
              "Reply within one business day",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span aria-hidden className="mt-0.5 text-xs text-gold">◆</span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
