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

Output STRICT JSON:
{
  "clips": [
    {
      "startSec": <number>,
      "endSec": <number>,
      "hookTitle": "<10-12 word click-worthy title, no quotes inside>",
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
    .filter(
      (c): c is ClipPick =>
        typeof c === "object" &&
        c !== null &&
        typeof c.startSec === "number" &&
        typeof c.endSec === "number" &&
        c.endSec > c.startSec &&
        c.endSec - c.startSec >= 10 &&
        c.endSec - c.startSec <= 120 &&
        typeof c.hookTitle === "string" &&
        typeof c.viralityScore === "number"
    )
    .map((c) => ({
      ...c,
      hookTitle: c.hookTitle.slice(0, 200),
      reason: (c.reason || "").slice(0, 300),
      viralityScore: Math.max(1, Math.min(10, Math.round(c.viralityScore))),
    }))
    .sort((a, b) => a.startSec - b.startSec);
}
