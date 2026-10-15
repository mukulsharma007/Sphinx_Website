import { LinkButton } from "@/components/ui/Button";
import HeroChatDemo from "./HeroChatDemo";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-night text-bone">
      {/* Faint gold glow rising from the horizon — pure CSS, no image */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 110%, rgba(194,154,63,0.18), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-32">
        <div>
          <p className="eyebrow eyebrow-dark fade-up">AI agent for B2B websites</p>

          <h1 className="display fade-up fade-up-1 mt-5 text-4xl md:text-5xl">
            Every visitor arrives
            <br />
            with a question.
            <br />
            <span className="text-gold-bright">Sphinx answers it.</span>
          </h1>

          <p className="fade-up fade-up-2 mt-6 max-w-md text-base leading-relaxed text-bone/70">
            Trained on your own content, Sphinx answers customer questions,
            links them to the exact page or form they need, and captures the
            lead — before your team even wakes up.
          </p>

          <div className="fade-up fade-up-3 mt-8 flex flex-wrap gap-3">
            <LinkButton href="/demo" size="lg">
              Request a demo
            </LinkButton>
            <LinkButton href="/product" size="lg" variant="outline" className="text-bone">
              See how it works
            </LinkButton>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <HeroChatDemo />
        </div>
      </div>
    </section>
  );
}
