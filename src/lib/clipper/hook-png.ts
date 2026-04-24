import { spawn } from "child_process";
import path from "path";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "render-hook.py");

export function renderHookPng(text: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [SCRIPT_PATH, text, outPath]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`render-hook.py exited ${code}: ${stderr}`));
    });
    child.on("error", reject);
  });
}
