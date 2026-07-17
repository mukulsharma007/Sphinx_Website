import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import CTA from "@/components/sections/CTA";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for Sphinx: Starter, Growth, and Enterprise.",
};

const tiers = [
  {
    name: "Starter",
    price: "€49",
    period: "/month",
    blurb: "For a single site that needs answers handled.",
    features: ["1 website", "500 conversations / month", "Trained on your content", "Email handoff to your team"],
    cta: "Start with Starter",
    accent: false,
  },
  {
    name: "Growth",
    price: "€149",
    period: "/month",
    blurb: "For teams that want leads, not just answers.",
    features: [
      "3 websites",
      "5,000 conversations / month",
      "Lead capture with CRM sync",
      "Conversation analytics",
      "Priority support",
    ],
    cta: "Choose Growth",
    accent: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    blurb: "For custom pipelines and compliance needs.",
    features: ["Unlimited sites", "Custom training pipeline", "SSO & audit logs", "SLA & dedicated onboarding"],
    cta: "Talk to us",
    accent: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="eyebrow">Pricing</p>
        <h1 className="display mt-4 max-w-2xl text-4xl text-night md:text-5xl">
          Pay for answered customers, not seats.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone">
          Prototype pricing — pilot customers lock in these rates. Every plan
          starts with a free pilot on your own content.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <Card key={tier.name} accent={tier.accent} className="flex flex-col">
              <div className="flex items-baseline justify-between">
                <h2 className="display text-xl text-night">{tier.name}</h2>
                {tier.accent && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-gold">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-4">
                <span className="display text-4xl text-night">{tier.price}</span>
                <span className="text-sm text-stone">{tier.period}</span>
              </p>
              <p className="mt-2 text-sm text-stone">{tier.blurb}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-ink">
                    <span aria-hidden className="mt-0.5 text-xs text-gold">◆</span>
                    {f}
                  </li>
                ))}
              </ul>

              <LinkButton
                href="/contact"
                variant={tier.accent ? "primary" : "dark"}
                className="mt-8 w-full"
              >
                {tier.cta}
              </LinkButton>
            </Card>
          ))}
        </div>
      </section>
      <CTA />
    </>
  );
}
