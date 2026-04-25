import type { ClipPick, ClipPickResponse, WhisperSegment } from "./types";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";

const SYSTEM = `You are a viral short-form video editor. You watch long-form podcasts and interviews and pick the moments that make people stop scrolling.

You receive a transcript with [start-end seconds] timestamps. Pick the moments that would work as standalone TikToks/Reels/Shorts.

A great clip:
- Stands alone — viewer doesn't need context from before/after
- Has a hook in the first 3 seconds (a question, contrarian take, story start, big claim, surprising stat)
- Resolves or pays off (lesson, punchline, twist, advice)
- 20-90 seconds total (sweet spot 30-60s)
- Speaker is making ONE clear point, not rambling

Banned: clips that are introductions ("welcome to the show"), goodbyes, generic banter, or clips that require setup the viewer doesn't have.

Pick variable count — could be 3 clips from a 15-min interview, could be 8 from a 60-min one. Quality over quantity, but lean BOLD over safe — viral clips are usually contrarian, surprising, emotional, or controversial. A safe-sounding 8/10 is worth less than a polarizing 7/10 that makes people stop scrolling.

For EACH clip, write THREE different hook titles using DIFFERENT angles:
- hookTitles[0]: question or curiosity gap ("Why does ___?", "The truth about ___")
- hookTitles[1]: contrarian or hot take ("Most people are wrong about ___", "Stop doing ___")
- hookTitles[2]: stat shock or POV ("97% of people ___", "POV: you just ___")
Each title 6-12 words. NO emojis in titles. NO ALL CAPS. Specific over generic.

Output STRICT JSON:
{
  "clips": [
    {
      "startSec": <number>,
      "endSec": <number>,
      "hookTitles": ["<question hook>", "<contrarian hook>", "<stat/POV hook>"],
      "reason": "<1-sentence why this clip works>",
      "viralityScore": <1-10 integer>
    }
  ]
}

Rules:
- startSec MUST be earlier than endSec
- Each clip 20-90 seconds long
- Clips MUST NOT overlap each other
- viralityScore: 9-10 = standout, 7-8 = strong, 5-6 = decent, below 5 = don't include
- hookTitles array MUST have exactly 3 different angles
- Return only the JSON object. No preamble, no markdown fences.`;

function formatSegments(segments: WhisperSegment[]): string {
  return segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
}

export async function pickClips(
  segments: WhisperSegment[],
  sourceTitle: string,
  guidance?: string
): Promise<ClipPick[]> {
  const transcript = formatSegments(segments);

  const guidanceBlock = guidance && guidance.trim().length > 0
    ? `\n\nUSER'S GUIDANCE (treat as additional rules — they know their content best):\n${guidance.trim().slice(0, 500)}\n`
    : "";

  const userPrompt = `Source: "${sourceTitle}"${guidanceBlock}

Transcript:
${transcript}

Output the JSON.`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      think: false,
      format: "json",
      options: {
        temperature: 0.4,
        num_predict: 4096,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { message: { content: string } };
  const raw = (data.message?.content ?? "").trim();

  let parsed: ClipPickResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Picker returned non-JSON: ${raw.slice(0, 300)}`);
  }

  if (!parsed.clips || !Array.isArray(parsed.clips)) {
    throw new Error(`Picker missing clips array: ${raw.slice(0, 300)}`);
  }

  return parsed.clips
    .map((c) => {
      // Backwards-compat: accept either hookTitles[] or single hookTitle.
      const raw = c as unknown as {
        startSec?: number;
        endSec?: number;
        hookTitle?: string;
        hookTitles?: string[];
        reason?: string;
        viralityScore?: number;
      };
      const titles = Array.isArray(raw.hookTitles)
        ? raw.hookTitles.filter((t): t is string => typeof t === "string")
        : raw.hookTitle
          ? [raw.hookTitle]
          : [];
      if (
        typeof raw.startSec !== "number" ||
        typeof raw.endSec !== "number" ||
        raw.endSec <= raw.startSec ||
        raw.endSec - raw.startSec < 10 ||
        raw.endSec - raw.startSec > 120 ||
        titles.length === 0 ||
        typeof raw.viralityScore !== "number"
      ) {
        return null;
      }
      return {
        startSec: raw.startSec,
        endSec: raw.endSec,
        hookTitle: titles[0].slice(0, 200),
        hookVariants: titles.slice(0, 3).map((t) => t.slice(0, 200)),
        reason: (raw.reason || "").slice(0, 300),
        viralityScore: Math.max(1, Math.min(10, Math.round(raw.viralityScore))),
      };
    })
    .filter((c): c is ClipPick => c !== null)
    .filter((c) => c.viralityScore >= MIN_VIRALITY_SCORE)
    .sort((a, b) => a.startSec - b.startSec);
}

// JS-side quality floor — generous (Gemma's prompt is the real gate).
// Was 7 briefly; that filter dropped genuinely viral-but-risky picks
// (contrarian takes Gemma rates conservatively). Back to 5 = "decent
// or better" which lets the prompt's character drive the calls.
const MIN_VIRALITY_SCORE = 5;
// Pure quality cap — never return more than this even on huge sources.
// Discards LOWEST-scoring picks first if exceeded.
const MAX_CLIPS_PER_JOB = 15;
// Transcript window size in seconds — Gemma sees one window at a time
// instead of being asked to reason over a 3-hour transcript at once.
// Adjacent windows OVERLAP by WINDOW_OVERLAP_SEC so a clip that spans a
// chunk boundary still gets picked from one of the windows.
const WINDOW_DURATION_SEC = 30 * 60;
const WINDOW_OVERLAP_SEC = 90;
// Picks across windows that occupy >= this fraction of overlapping time
// are treated as duplicates (keep the higher-scoring one).
const DEDUPE_OVERLAP_THRESHOLD = 0.5;

/**
 * Chunked picker for long sources. Splits the transcript into overlapping
 * 30-min windows, runs pickClips on each window sequentially (single-flight
 * — Gemma is RAM-bound on this hardware), then merges the results:
 *   1. Concatenate all picks across windows
 *   2. Deduplicate clips that overlap in time (keep higher viralityScore)
 *   3. Sort by virality, drop anything below MIN_VIRALITY_SCORE
 *   4. Cap at MAX_CLIPS_PER_JOB
 *   5. Re-sort by start time for downstream rendering
 *
 * For sources <= WINDOW_DURATION_SEC this just calls pickClips once with
 * no overhead.
 */
export async function pickClipsChunked(
  segments: WhisperSegment[],
  sourceTitle: string,
  onChunkProgress?: (chunkIdx: number, totalChunks: number) => void,
  guidance?: string
): Promise<ClipPick[]> {
  if (segments.length === 0) return [];
  const sourceDur = segments[segments.length - 1].end;

  if (sourceDur <= WINDOW_DURATION_SEC) {
    onChunkProgress?.(0, 1);
    return pickClips(segments, sourceTitle, guidance);
  }

  const windows = buildWindows(sourceDur);
  console.log(
    `[picker] chunking ${(sourceDur / 60).toFixed(1)}min source into ${windows.length} ${WINDOW_DURATION_SEC / 60}-min windows`
  );

  const allPicks: ClipPick[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    onChunkProgress?.(i, windows.length);

    const windowSegments = segments.filter((s) => s.end > w.start && s.start < w.end);
    if (windowSegments.length === 0) continue;

    try {
      const picks = await pickClips(windowSegments, sourceTitle, guidance);
      console.log(
        `[picker] chunk ${i + 1}/${windows.length} (${(w.start / 60).toFixed(1)}-${(w.end / 60).toFixed(1)}min): ${picks.length} pick(s)`
      );
      allPicks.push(...picks);
    } catch (err) {
      console.warn(`[picker] chunk ${i + 1}/${windows.length} failed:`, err);
      // Continue with remaining chunks — partial results > total failure.
    }
  }

  return mergeAndDedupe(allPicks);
}

function buildWindows(sourceDur: number): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < sourceDur) {
    const end = Math.min(sourceDur, start + WINDOW_DURATION_SEC);
    windows.push({ start, end });
    if (end >= sourceDur) break;
    start = end - WINDOW_OVERLAP_SEC;
  }
  return windows;
}

function mergeAndDedupe(picks: ClipPick[]): ClipPick[] {
  if (picks.length === 0) return [];
  // Sort by score desc — when we encounter overlapping picks, the
  // first-seen (higher score) wins.
  const sorted = [...picks].sort((a, b) => b.viralityScore - a.viralityScore);
  const kept: ClipPick[] = [];
  for (const p of sorted) {
    const isDupe = kept.some((k) => clipsOverlap(p, k));
    if (!isDupe) kept.push(p);
  }
  // Apply cap then re-sort by start time for the renderer.
  return kept
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .slice(0, MAX_CLIPS_PER_JOB)
    .sort((a, b) => a.startSec - b.startSec);
}

function clipsOverlap(a: ClipPick, b: ClipPick): boolean {
  const overlapStart = Math.max(a.startSec, b.startSec);
  const overlapEnd = Math.min(a.endSec, b.endSec);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  if (overlap === 0) return false;
  const minDur = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return overlap / minDur >= DEDUPE_OVERLAP_THRESHOLD;
}
