import type { Metadata } from "next";
import CTA from "@/components/sections/CTA";
import Card from "@/components/ui/Card";
import { steps } from "@/content/features";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How Sphinx works: trained on your content, answers with real links, captures leads, hands off to humans when it should.",
};

const useCases = [
  {
    title: "Support deflection",
    description:
      "Repetitive questions — onboarding, billing, integrations — get answered instantly from your docs, so your team handles only the hard ones.",
  },
  {
    title: "Lead capture",
    description:
      "Pricing and demo questions are buying signals. Sphinx recognizes them, collects contact details, and delivers the lead with full conversation context.",
  },
  {
    title: "Navigation concierge",
    description:
      "\"Where's the API documentation?\" gets a link, not a paragraph. Visitors reach the right page in one message instead of five clicks.",
  },
];

export default function ProductPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="eyebrow">Product</p>
        <h1 className="display mt-4 max-w-2xl text-4xl text-night md:text-5xl">
          An agent that knows your business — because it learned from it.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-stone">
          Sphinx is not a scripted chatbot. It ingests your website, docs, and
          FAQs into a private knowledge base, then answers visitors the way your
          best support person would — including handing over the exact link
          they need.
        </p>
      </section>

      <section className="border-y border-sand bg-sand/30">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <ol className="grid gap-10 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="font-mono text-sm text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="display mt-2 text-xl text-night">{step.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-stone">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <p className="eyebrow">Where it earns its keep</p>
        <h2 className="display mt-4 text-3xl text-night md:text-4xl">
          Three jobs, one widget.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {useCases.map((u) => (
            <Card key={u.title}>
              <h3 className="display text-lg text-night">{u.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-stone">
                {u.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <CTA />
    </>
  );
}
