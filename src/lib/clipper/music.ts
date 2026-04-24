import { readdir, readFile, stat } from "fs/promises";
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

export type TrackPick = {
  path: string;
  /** Pre-formatted attribution string to append to the caption (e.g.
   * "♪ Music: Track by Artist (CC-BY)"). Null = no attribution required. */
  attribution: string | null;
};

type Sidecar = {
  title?: string;
  artist?: string;
  license?: string;
  attributionRequired?: boolean;
  attributionText?: string;
  sourceUrl?: string;
};

async function readSidecar(trackPath: string): Promise<Sidecar | null> {
  const sidecarPath = `${trackPath}.json`;
  try {
    const raw = await readFile(sidecarPath, "utf8");
    return JSON.parse(raw) as Sidecar;
  } catch {
    return null;
  }
}

function formatAttribution(sidecar: Sidecar | null): string | null {
  if (!sidecar) return null;
  if (sidecar.attributionRequired === false) return null;
  if (sidecar.attributionText) return sidecar.attributionText;
  // Build a default attribution if metadata exists but no explicit text
  if (sidecar.attributionRequired && (sidecar.title || sidecar.artist)) {
    const title = sidecar.title || "untitled";
    const artist = sidecar.artist || "unknown";
    const license = sidecar.license ? ` (${sidecar.license})` : "";
    return `♪ Music: ${title} by ${artist}${license}`;
  }
  return null;
}

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
 *
 * Includes any attribution string from the track's sidecar JSON file.
 */
export async function pickMusicTrack(mood?: Mood): Promise<TrackPick | null> {
  let trackPath: string | null = null;
  if (mood) {
    trackPath = await pickFromDir(path.join(MUSIC_ROOT, mood));
  }
  if (!trackPath) trackPath = await pickFromDir(MUSIC_ROOT);
  if (!trackPath) return null;

  const sidecar = await readSidecar(trackPath);
  return { path: trackPath, attribution: formatAttribution(sidecar) };
}
