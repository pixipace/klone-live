import { readdir, stat } from "fs/promises";
import path from "path";

const SFX_ROOT = path.join(process.cwd(), "assets", "sfx");
const SUPPORTED = /\.(mp3|m4a|wav|ogg|aac)$/i;

async function pickFromDir(dir: string): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const tracks: string[] = [];
    for (const f of files) {
      if (f.startsWith(".")) continue;
      if (!SUPPORTED.test(f)) continue;
      const full = path.join(dir, f);
      const s = await stat(full);
      if (s.isFile()) tracks.push(full);
    }
    if (tracks.length === 0) return null;
    return tracks[Math.floor(Math.random() * tracks.length)];
  } catch {
    return null;
  }
}

export async function pickHookInSfx(): Promise<string | null> {
  return pickFromDir(path.join(SFX_ROOT, "hook-in"));
}
