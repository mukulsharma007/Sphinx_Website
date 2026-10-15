import { runPythonScript } from "@/lib/python";
import type { Message } from "@/components/chat/ChatMessage";

export async function POST(req: Request) {
  let body: { messages?: unknown; sessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ reply: "I couldn't read that — try again?" }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ reply: "Please send a valid chat history." }, { status: 400 });
  }

  const sessionId = body.sessionId;
  if (sessionId !== undefined && (
    typeof sessionId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(sessionId)
  )) {
    return Response.json({ reply: "Invalid demo session." }, { status: 400 });
  }

  try {
    const result = await runPythonScript<{ reply: string }>("rag_generate.py", {
      messages: body.messages as Message[],
      ...(sessionId ? { sessionId } : {}),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[chat] Python chat failed:", error);
    return Response.json(
      { reply: "I couldn't reach the document chat service. Please try again." },
      { status: 503 },
    );
  }
}
