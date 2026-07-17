import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import CTA from "@/components/sections/CTA";
import { steps } from "@/content/features";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />

      {/* How it works — numbered because it genuinely is a sequence */}
      <section className="border-y border-sand bg-sand/30">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-4 text-3xl text-night md:text-4xl">
            From your content to answered customers, in three moves.
          </h2>

          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="font-mono text-sm text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="display mt-2 text-xl text-night">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-stone">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CTA />
    </>
  );
}
