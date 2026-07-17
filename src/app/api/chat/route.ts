import { spawn } from "node:child_process";
import path from "node:path";
import type { Message } from "@/components/chat/ChatMessage";

export async function POST(req: Request) {
  let messages: Message[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) messages = body.messages;
  } catch {
    return Response.json({ reply: "I couldn't read that — try again?" }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "llm_chat.py");

  const result = await new Promise<{ reply: string }>((resolve) => {
    const child = spawn("python", [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout.trim() || "{}");
        resolve({ reply: parsed.reply || "I couldn't generate a response." });
      } catch {
        resolve({ reply: stderr.trim() || "I couldn't generate a response." });
      }
    });

    child.stdin.write(JSON.stringify({ messages }));
    child.stdin.end();
  });

  return Response.json(result);
}
