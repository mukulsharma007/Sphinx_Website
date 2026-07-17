import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Adds a gold top rule — for highlighted cards (e.g. recommended plan). */
  accent?: boolean;
};

export default function Card({ children, className, accent }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-sand bg-white p-6",
        "transition-transform duration-200 hover:-translate-y-0.5",
        accent ? "border-t-2 border-t-gold" : "",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
