import type { Metadata } from "next";
import Link from "next/link";
import FAQAccordion from "@/components/sections/FAQAccordion";
import { faqs } from "@/content/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about Sphinx: setup, training, pricing, security, and languages.",
};

export default function FAQPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-24">
      <p className="eyebrow">FAQ</p>
      <h1 className="display mt-4 text-4xl text-night md:text-5xl">
        Questions, answered.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-stone">
        These answers double as Sphinx&apos;s own training material — what you
        read here is what the agent says in chat.
      </p>

      <div className="mt-10">
        <FAQAccordion faqs={faqs} />
      </div>

      <p className="mt-8 text-sm text-stone">
        Didn&apos;t find it? Ask the widget in the corner, or{" "}
        <Link href="/contact" className="font-medium text-gold underline underline-offset-2">
          write to us directly
        </Link>
        .
      </p>
    </section>
  );
}
