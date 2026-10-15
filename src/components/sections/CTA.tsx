import { LinkButton } from "@/components/ui/Button";

export default function CTA() {
  return (
    <section className="bg-night">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 md:flex-row md:items-center md:justify-between md:py-20">
        <div>
          <h2 className="display text-3xl text-bone md:text-4xl">
            Your customers are asking.
            <br />
            <span className="text-gold-bright">Sphinx is ready.</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-bone/60">
            Get a working pilot on your own content — see real answers before
            you commit to anything.
          </p>
        </div>
        <LinkButton href="/demo" size="lg" className="shrink-0">
          Request a demo
        </LinkButton>
      </div>
    </section>
  );
}
