import Card from "@/components/ui/Card";
import { features } from "@/content/features";

export default function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p className="eyebrow">What Sphinx does</p>
      <h2 className="display mt-4 max-w-xl text-3xl text-night md:text-4xl">
        A concierge at the door, not a script in a box.
      </h2>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title}>
            <h3 className="display text-lg text-night">{f.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-stone">
              {f.description}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
