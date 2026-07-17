import type { Metadata } from "next";
import CTA from "@/components/sections/CTA";

export const metadata: Metadata = {
  title: "About",
  description: "Why we're building Sphinx: an AI agent for B2B websites.",
};

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-6 py-20 md:py-24">
        <p className="eyebrow">About</p>
        <h1 className="display mt-4 text-4xl text-night md:text-5xl">
          The Sphinx asked riddles.
          <br />
          <span className="text-gold">Ours answers them.</span>
        </h1>

        <div className="mt-8 space-y-5 text-base leading-relaxed text-stone">
          <p>
            Every B2B website has the same quiet problem: visitors arrive with
            specific questions, and the answers are buried three clicks deep.
            Most leave before finding them. The ones who stay end up emailing
            support about things already written on the site.
          </p>
          <p>
            We&apos;re building Sphinx to close that gap — an agent trained on a
            company&apos;s own content that answers in plain language and hands
            visitors the exact link they need. Not a decision tree. Not a
            generic model guessing about your business. Your content, made
            conversational.
          </p>
          <p>
            This site is our first proving ground: the widget in the corner is
            Sphinx itself, learning from these very pages. What works here
            becomes the product we bring to other B2B companies — pipeline,
            training, and all.
          </p>
        </div>
      </section>
      <CTA />
    </>
  );
}
