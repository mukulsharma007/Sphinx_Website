import Link from "next/link";
import type { ReactNode } from "react";

/* Sphinx's USP is answering with real links. This helper makes any internal
   route mentioned in an assistant message clickable. Keep ROUTES in sync
   with the pages that exist. */

const ROUTES = ["/product", "/pricing", "/faq", "/about", "/contact"] as const;

const ROUTE_RE = new RegExp(`(${ROUTES.join("|")})(?![\\w-])`, "g");

export function linkify(text: string): ReactNode[] {
  const parts = text.split(ROUTE_RE);

  return parts.map((part, i) =>
    (ROUTES as readonly string[]).includes(part) ? (
      <Link
        key={i}
        href={part}
        className="font-medium text-gold underline underline-offset-2 hover:text-gold-bright"
      >
        {part}
      </Link>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
