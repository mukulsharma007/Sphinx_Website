import type { Metadata } from "next";
import { Marcellus, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@/src/app/globals.css";

import Navbar from "@/src/components/layout/Navbar";
import Footer from "@/src/components/layout/Footer";
import ChatWidget from "@/src/components/chat/ChatWidget";

/* Marcellus: Roman-capital serif — carved-in-stone feel for the Sphinx brand.
   One weight only (400); we use size + letterspacing for hierarchy. */
const marcellus = Marcellus({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marcellus",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Sphinx — AI agent for B2B websites",
    template: "%s — Sphinx",
  },
  description:
    "Sphinx answers your customers' questions from your own content, points them to the exact page or form they need, and captures leads while you sleep.",
  openGraph: {
    title: "Sphinx — AI agent for B2B websites",
    description:
      "An AI agent trained on your content. Answers questions, shares the right links, captures leads.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${marcellus.variable} ${hanken.variable} ${plex.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
