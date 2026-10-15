# Sphinx — website + chat widget (Month 1)

Marketing site for Sphinx, the AI agent for B2B websites. The site includes a local Ollama + Chroma RAG chat and an interactive
document demo at `/demo`.

## Getting started

Requires an existing Next.js project created with:

```bash
npx create-next-app@latest sphinx-web --typescript --tailwind --eslint --app --src-dir
```

Then copy this starter's `src/`, `.env.example`, and `README.md` over the
generated ones (replace `src/app/page.tsx`, `layout.tsx`, `globals.css`).

```bash
cp .env.example .env.local   # fill values as needed
npm run dev                  # http://localhost:3000
```

Install the Python dependencies with `pip install -r requirements.txt` and
make sure Ollama is running with the `bge-large:latest` embedding and
`mistral:latest` chat models available. Set `PYTHON_EXECUTABLE` in `.env.local`
if Python is not on `PATH`.

The `/demo` page accepts PDF, DOCX, PPTX, XLSX, and common text-based formats.
Uploads are chunked and embedded into the existing Chroma collection, with a
random browser-scoped session ID attached to every chunk so demo chats only
retrieve that browser's uploaded documents.

### Tailwind version note

`globals.css` targets **Tailwind v4** (CSS-first config via `@theme`), which is
what `create-next-app@latest` ships. If your project has a `tailwind.config.ts`
(Tailwind v3), move the colors/fonts from `@theme` into `theme.extend` there
and replace `@import "tailwindcss"` with the three `@tailwind` directives.

## Design system

All tokens live at the top of `src/app/globals.css` — change five hex values to
restyle the whole site.

| Token | Value | Role |
| --- | --- | --- |
| `night` | `#101422` | dark sections: hero, footer, CTA |
| `ink` | `#20243a` | body text on light |
| `bone` | `#f4f3ee` | page background |
| `sand` | `#e4e1d6` | borders, dividers |
| `stone` | `#7d7a6f` | secondary text |
| `gold` | `#c29a3f` | the single accent — use sparingly |

Type: **Marcellus** (display — Roman-capital serif, one weight, carved-in-stone
feel) + **Hanken Grotesk** (body) + **IBM Plex Mono** (labels/eyebrows). Loaded
via `next/font` in `layout.tsx`.

## Where things live

- `src/content/` — FAQ + features as typed data. **This is the future
  knowledge base**: write every answer as the bot should say it, links included.
- `src/components/chat/` — the site chat widget and full-page document demo.
  `/api/chat` accepts `{ messages, sessionId? } -> { reply }`.
- `src/app/api/documents/route.ts` and `scripts/ingest_documents.py` — validate,
  extract, chunk, and add demo uploads to the Chroma vector collection.
- `src/lib/linkify.tsx` — renders internal routes in bot replies as real links.
  Add new routes here when you add pages.
- `src/app/api/contact/route.ts` — logs demo requests; swap the `console.log`
  for Resend when ready.

## Wiring up email (optional, Month 1)

1. Create a free account at resend.com, get an API key into `.env.local`.
2. `npm i resend`, then in `api/contact/route.ts` replace the log with
   `await resend.emails.send(...)` to your own address.

## Team workflow

- Branch per task: `feature/faq-page`, `fix/navbar-mobile`.
- Conventional commits: `feat: pricing tiers`, `fix: chat autoscroll`.
- PRs into `main`; Vercel gives every PR a preview URL.
- Track tasks as GitHub Issues on a simple Todo / In progress / Done board.
