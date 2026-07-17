/* ---------------------------------------------------------------------------
   FAQ knowledge base.
   Write every answer exactly as the chatbot should say it — plain language,
   with the relevant internal link included in the text. In Month 2 this file
   is embedded directly into the retrieval pipeline.
--------------------------------------------------------------------------- */

export type FAQItem = {
  question: string;
  answer: string;
  category: "product" | "pricing" | "technical" | "general";
};

export const faqs: FAQItem[] = [
  {
    question: "What is Sphinx?",
    answer:
      "Sphinx is an AI agent that lives on your website. It answers customer questions using your own content, points visitors to the exact page or form they need, and captures leads when someone shows buying intent. You can read how it works step by step at /product.",
    category: "product",
  },
  {
    question: "How is Sphinx different from a normal chatbot?",
    answer:
      "Most chatbots follow scripted decision trees. Sphinx is trained on your actual website, docs, and FAQs, so it answers open questions in natural language — and instead of describing where something is, it hands over the direct link. When it can't help, it hands the conversation to a human instead of guessing.",
    category: "product",
  },
  {
    question: "What do you need from us to get started?",
    answer:
      "Just your public content to begin with: your website URL, help docs, and any FAQ material. Sphinx ingests that and is ready for review within a day. You can refine or exclude anything before going live. Book a walkthrough at /contact.",
    category: "technical",
  },
  {
    question: "How long does setup take?",
    answer:
      "For a typical B2B site, under a week: one day to ingest your content, a review round with your team, then a one-line script tag to embed the widget. No engineering project required on your side.",
    category: "technical",
  },
  {
    question: "Can Sphinx capture leads?",
    answer:
      "Yes. When a visitor asks about pricing, demos, or implementation, Sphinx offers to take their details and pushes them to your inbox or CRM. Every lead includes the full conversation, so your sales team has context before the first call.",
    category: "product",
  },
  {
    question: "What happens when Sphinx doesn't know the answer?",
    answer:
      "It says so — honestly — and offers two exits: leave your details for a human follow-up, or go straight to /contact. Sphinx never invents answers about your business; anything outside its knowledge base gets escalated.",
    category: "product",
  },
  {
    question: "How much does Sphinx cost?",
    answer:
      "Plans start at €49/month for a single site, and Growth at €149/month adds lead capture with CRM sync. Full details are on /pricing. During the prototype phase, pilot customers get onboarding free.",
    category: "pricing",
  },
  {
    question: "Is there a free trial?",
    answer:
      "We run pilots instead of self-serve trials right now: we set Sphinx up on your content, you test it with real traffic for two weeks, then decide. Request a pilot at /contact.",
    category: "pricing",
  },
  {
    question: "Where does our data live, and is it secure?",
    answer:
      "Your content is stored in an isolated knowledge base per customer — never shared, never used to train models for anyone else. Conversations are logged so you can review them, and you can request deletion at any time.",
    category: "technical",
  },
  {
    question: "Which languages does Sphinx support?",
    answer:
      "Sphinx answers in the language the visitor writes in, with English and German fully supported today. If your content exists in one language, Sphinx can still answer questions asked in another.",
    category: "general",
  },
];
