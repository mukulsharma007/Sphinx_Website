import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function getAppDirectory() {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), "Sphinx_Website"),
    path.join(process.cwd(), "..", "Sphinx_Website"),
  ];
  const appDirectory = candidates.find((directory) =>
    fs.existsSync(path.join(directory, "scripts", "llm_chat.py")),
  );

  if (!appDirectory) throw new Error("Could not locate the Sphinx Python scripts.");
  return appDirectory;
}

export function runPythonScript<T>(scriptName: string, payload: unknown): Promise<T> {
  const appDirectory = getAppDirectory();
  const scriptPath = path.join(appDirectory, "scripts", scriptName);
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: appDirectory,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${scriptName} exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as T);
      } catch {
        reject(new Error(stderr.trim() || `${scriptName} returned an invalid response.`));
      }
    });
    child.stdin.on("error", reject);
    child.stdin.end(JSON.stringify(payload));
  });
}
