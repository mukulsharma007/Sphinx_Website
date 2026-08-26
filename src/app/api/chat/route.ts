import { spawn } from "node:child_process";
import fs from "node:fs";
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

  const candidateDirs = [process.cwd(), path.join(process.cwd(), "Sphinx_Website"), path.join(process.cwd(), "..", "Sphinx_Website")];
  const appDir = candidateDirs.find((dir) => fs.existsSync(path.join(dir, "scripts", "llm_chat.py"))) ?? process.cwd();
  const scriptPath = path.join(appDir, "scripts", "llm_chat.py");
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "C:\\Users\\sharm\\Anaconda3\\python.exe" : "python");

  const result = await new Promise<{ reply: string }>((resolve) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: appDir,
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

    child.on("error", (err) => {
      resolve({ reply: `I hit a snag starting the local Python script: ${err.message}` });
    });

    child.on("close", (code) => {
      if (code !== 0 && stderr.trim()) {
        resolve({ reply: stderr.trim() });
        return;
      }

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
