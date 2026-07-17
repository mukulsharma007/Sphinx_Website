export type Feature = {
  title: string;
  description: string;
};

export const features: Feature[] = [
  {
    title: "Trained on your content",
    description:
      "Sphinx learns from your website, docs, and FAQs — so every answer sounds like your company wrote it, because it did.",
  },
  {
    title: "Answers with links, not paragraphs",
    description:
      "Ask where the contact form is and Sphinx doesn't describe it — it hands you the link. Visitors get where they're going in one message.",
  },
  {
    title: "Captures leads while you sleep",
    description:
      "When a visitor shows buying intent, Sphinx takes their details and pushes them to your inbox or CRM, with the full conversation attached.",
  },
  {
    title: "Knows when to hand off",
    description:
      "Outside its knowledge base, Sphinx never guesses. It escalates to your team with context, so no conversation dies in a dead end.",
  },
];

/* The three-step story used on the home and product pages.
   This IS a sequence, so it's numbered deliberately. */
export const steps = [
  {
    title: "Connect your content",
    description:
      "Point Sphinx at your website, help docs, and FAQs. It builds a private knowledge base for your company in about a day.",
  },
  {
    title: "Sphinx answers — with the right link",
    description:
      "Visitors ask in plain language. Sphinx replies from your content and links them straight to the page, form, or doc they need.",
  },
  {
    title: "Leads and handoffs reach your team",
    description:
      "Buying signals become captured leads in your CRM. Unanswerable questions become handoffs with full context. Nothing is lost.",
  },
];
