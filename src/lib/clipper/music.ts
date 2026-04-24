import { readdir } from "fs/promises";
import path from "path";

const MUSIC_DIR = path.join(process.cwd(), "assets", "music");
const SUPPORTED = /\.(mp3|m4a|wav|ogg|aac)$/i;

export async function pickMusicTrack(): Promise<string | null> {
  try {
    const files = await readdir(MUSIC_DIR);
    const tracks = files.filter((f) => SUPPORTED.test(f) && !f.startsWith("."));
    if (tracks.length === 0) return null;
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    return path.join(MUSIC_DIR, pick);
  } catch {
    return null;
  }
}
