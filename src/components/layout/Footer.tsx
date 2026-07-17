import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "/product", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-night text-bone">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <p className="display flex items-center gap-2 text-lg tracking-[0.22em]">
              <span aria-hidden className="text-xs text-gold">◆</span>
              SPHINX
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-bone/60">
              An AI agent for B2B websites. Answers from your content, links to
              the right place, hands off when it should.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-bone/50">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-bone/80 transition-colors hover:text-gold-bright"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-bone/10 pt-6 text-xs text-bone/40">
          © {new Date().getFullYear()} Sphinx. Built as a working prototype — expect rapid change.
        </div>
      </div>
    </footer>
  );
}
