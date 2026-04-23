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

Pick variable count — could be 3 clips from a 15-min interview, could be 8 from a 60-min one. Quality over quantity.

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
  sourceTitle: string
): Promise<ClipPick[]> {
  const transcript = formatSegments(segments);

  const userPrompt = `Source: "${sourceTitle}"

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
    .sort((a, b) => a.startSec - b.startSec);
}
