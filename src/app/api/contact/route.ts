import { validateContact, type ContactPayload } from "@/lib/validate";

export async function POST(req: Request) {
  let data: Partial<ContactPayload>;
  try {
    data = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const check = validateContact(data);
  if (!check.valid) {
    return Response.json({ ok: false, errors: check.errors }, { status: 400 });
  }

  /* v0: log to the server console (visible in `npm run dev` output and in
     Vercel's function logs). Next step: send yourself an email via Resend —
     see README "Wiring up email". */
  console.log("[contact] new demo request:", {
    name: data.name,
    company: data.company,
    email: data.email,
    message: data.message,
    at: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}
