import { readdir, stat } from "fs/promises";
import path from "path";

const MUSIC_ROOT = path.join(process.cwd(), "assets", "music");
const SUPPORTED = /\.(mp3|m4a|wav|ogg|aac)$/i;

export type Mood =
  | "energetic"
  | "chill"
  | "dramatic"
  | "hopeful"
  | "motivational"
  | "comedic"
  | "urgent"
  | "neutral";

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

/**
 * Pick a music track. If a mood is given, look in /assets/music/{mood}/ first;
 * fall back to flat /assets/music/ if mood folder is empty/missing. Returns
 * null if no music files exist anywhere.
 */
export async function pickMusicTrack(mood?: Mood): Promise<string | null> {
  if (mood) {
    const fromMood = await pickFromDir(path.join(MUSIC_ROOT, mood));
    if (fromMood) return fromMood;
  }
  // Fallback: flat root directory
  return pickFromDir(MUSIC_ROOT);
}
