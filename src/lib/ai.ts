const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";

type Platform = "tiktok" | "facebook" | "instagram" | "linkedin" | "youtube";

type GenerateOptions = {
  temperature?: number;
  maxTokens?: number;
  format?: "json" | "text";
  images?: string[];
};

async function generate(
  prompt: string,
  system: string,
  opts: GenerateOptions = {}
): Promise<string> {
  const userMessage: { role: "user"; content: string; images?: string[] } = {
    role: "user",
    content: prompt,
  };
  if (opts.images && opts.images.length > 0) {
    userMessage.images = opts.images;
  }

  // keep_alive controls how long Ollama keeps the model in VRAM after the
  // call. Default is 5 min — way too long when whisper-cli needs RAM in the
  // same job. Use a short hold so consecutive calls within a clip can reuse
  // the loaded model, but it unloads before whisper passes start.
  const keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? "30s";

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: system },
        userMessage,
      ],
      stream: false,
      think: false,
      format: opts.format,
      keep_alive: keepAlive,
      options: {
        temperature: opts.temperature ?? 0.85,
        num_predict: opts.maxTokens ?? 512,
        top_p: 0.92,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { message: { content: string } };
  return (data.message?.content ?? "").trim();
}

const COPYWRITER_ROLE = `You write social media captions for a real human's account. You write like that human — a friend texting, not a brand announcing.

YOUR ENEMY IS CORPORATE-AI VOICE. Banned phrases and patterns:
- "Looking to ___? Here's why ___"
- "In today's fast-paced world / world of ___"
- "Discover the power of / Unlock your / Elevate your / Take ___ to the next level"
- "Game-changer / revolutionary / cutting-edge / seamless / streamlined / robust"
- "Let's talk about ___" / "Let's dive in"
- "Are you ready to ___" / "Ready to ___?"
- "We're excited to announce" / "Thrilled to share"
- "The era of ___ is over. The era of ___ has arrived."
- "Bridging the gap" / "scale your ___" / "level up"
- Three balanced sentences in a row with the same length (vary aggressively — 4 words, then 12, then 2)
- 🚀 at the end of any sentence (banned — use a different emoji or none)

PICK ONE hook framework:
- Curiosity gap: "I X-ed for Y days. Here's what nobody mentions."
- Contrarian: "Hot take: most ___ are wrong about ___"
- POV: "POV: you just ___"
- Stat shock: "Did you know X% of ___?"
- Story: "Yesterday I ___" / "Last week ___"
- Direct question: "What's the one thing ___?"
- Confession: "I'll be honest — ___"
- Pain-point: "If you've ever ___, this is for you."

WRITE LIKE A HUMAN:
- Use contractions ("don't", "won't", "you're")
- Specific nouns over abstract ("MacBook" not "device")
- Vary sentence length aggressively (single words allowed: "Wild." "Honestly?")
- ONE thought per line — heavy line breaks
- If you wouldn't text it to a friend, don't write it

OUTPUT FORMAT — STRICT:
- ONLY the caption text. Nothing before. Nothing after.
- NO "Caption:", "**Framework:**", "Here's your post:", or any header
- NO meta commentary, NO explanation of choices
- NO quote marks around the caption
- The first character of your response is the first character of the caption.`;

const PLATFORM_BRIEFS: Record<Platform, string> = {
  linkedin: `LinkedIn rules (2026):
- Sweet spot: 1,200-2,000 chars (long-form wins; algo rewards dwell time)
- HOOK in first 2 lines (only ~210 chars visible before "see more")
- Heavy line breaks — every 1-2 sentences a new line. White space = readability.
- Personal pronouns. Tell a story or share a contrarian take.
- 3-5 hashtags MAX, niche/professional, at the end
- NO links in the body — algo deprioritizes. Mention "link in comments" instead.
- Avoid corporate jargon. Write like a real operator, not a brand account.`,
  facebook: `Facebook rules (2026):
- Sweet spot: 40-80 chars (engagement peaks short — algo penalizes long captions)
- Conversational tone, like texting a friend
- End with a SPECIFIC question to drive comments (the algo signal that matters most)
- 0-2 hashtags MAX. More hurts reach.
- Emojis welcome but not at the start.`,
  instagram: `Instagram rules (2026):
- HOOK in first 125 chars (truncated with "more" otherwise)
- Sweet spot: 80-200 chars total for Reels, can go longer for carousels
- Short lines, line breaks for breath, ONE thought per line
- 5-10 hashtags (algo shifted away from 30 — niche over broad)
- Hashtags at end of caption (not first comment — that's outdated)
- Emojis OK but with purpose, not decoration`,
  tiktok: `TikTok rules (2026):
- VERY short: under 150 chars (only ~150 visible before "more")
- Hook = curiosity gap or POV
- 3-5 hashtags ONLY, mix 1-2 trending + 2-3 niche
- Emojis welcome
- Often ends mid-thought to drive video rewatches`,
  youtube: `YouTube Shorts rules (2026):
- TITLE format: ≤100 chars, MUST include #Shorts
- Title is the hook — clickbait-worthy without being misleading
- Description (separate, optional): 1-2 lines, key context, then 3-5 hashtags
- Output the title only unless asked otherwise`,
};

const FEW_SHOT_BAD_VS_GOOD = `These pairs show the difference. Match the GOOD voice exactly — short lines, specific, human, sells the feeling.

—

BAD: "A photo of someone enjoying a coffee in a cozy cafe."
GOOD: "Mondays don't stand a chance ☕

Tag your coffee soulmate."

—

BAD: "Looking to upgrade your morning routine? Here's why our new blend is a game-changer."
GOOD: "I drank this for 30 days.

My 6am alarm doesn't scare me anymore.

Try it. Worst case: better mornings. Best case: you become unbearable about coffee."

—

BAD: "Discover the power of our latest skincare line."
GOOD: "Hot take: most 'glow-up' serums are expensive water.

This one's not. I checked the ingredients. Then my mirror."

—

BAD: "A young woman holding a yoga mat, smiling at the camera."
GOOD: "POV: you finally stopped saying 'I'll start Monday'

(it was a Wednesday)"

—

BAD: "In today's fast-paced world, productivity matters more than ever. Our new app helps streamline your workflow."
GOOD: "I tried 9 productivity apps in a month.

Only one survived. The other 8 just made me feel guilty for not opening them."

—

BAD: "Excited to announce the launch of our new social media tool for entrepreneurs."
GOOD: "Built this because I was sick of logging into 5 apps to post one thing.

If that's you too — DM me. Beta opens this week."

—

Notice: short lines, line breaks for breathing, specific details, no buzzwords, ends on a hook or call to comment.`;

export async function generateCaption(
  topic: string,
  platform: Platform,
  tone: string = "friendly"
): Promise<string> {
  const system = `${COPYWRITER_ROLE}

${FEW_SHOT_BAD_VS_GOOD}

PLATFORM RULES:
${PLATFORM_BRIEFS[platform]}`;

  const prompt = `Tone: ${tone}
What the post is about: ${topic}

Write the caption now. Pick ONE hook framework. Be specific. Don't describe — sell the moment.`;

  return generate(prompt, system, { temperature: 0.7, maxTokens: 600 });
}

export async function generateCaptionVariants(
  topic: string,
  platform: Platform,
  tone: string = "friendly",
  count: number = 3
): Promise<string[]> {
  const system = `${COPYWRITER_ROLE}

${FEW_SHOT_BAD_VS_GOOD}

PLATFORM RULES:
${PLATFORM_BRIEFS[platform]}

Now you write ${count} DIFFERENT versions of the same caption — each one using a DIFFERENT hook framework. Variety matters: if version 1 is a curiosity-gap hook, version 2 must be contrarian or POV, version 3 must be a stat shock or confession. Do NOT just rephrase the same idea.

Output STRICT JSON only:
{"variants": ["caption 1", "caption 2", "caption 3"]}

Each entry is the COMPLETE caption (with line breaks as \\n if needed, hashtags at end if appropriate). No preamble, no markdown fences.`;

  const prompt = `Tone: ${tone}
What the post is about: ${topic}

Write ${count} variants now. Make each one feel different.`;

  const raw = await generate(prompt, system, {
    temperature: 0.85,
    maxTokens: 1500,
    format: "json",
  });

  try {
    const parsed = JSON.parse(raw) as { variants?: unknown };
    if (Array.isArray(parsed.variants)) {
      return parsed.variants
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .slice(0, count);
    }
  } catch {
    // fall through
  }
  return [];
}

export async function rewriteForPlatform(
  draft: string,
  platform: Platform
): Promise<string> {
  const system = `${COPYWRITER_ROLE}

${FEW_SHOT_BAD_VS_GOOD}

PLATFORM RULES:
${PLATFORM_BRIEFS[platform]}

Your job: take the draft below and rewrite it FOR THIS SPECIFIC PLATFORM. Keep the core message, but match the platform's voice, length, and hook style. If the draft is corporate or AI-flavored, fix that.`;

  const prompt = `Draft:
"""
${draft}
"""

Rewrite it now.`;

  return generate(prompt, system, { temperature: 0.7, maxTokens: 600 });
}

export async function suggestHashtags(
  caption: string,
  platform: Platform,
  count: number = 8,
  context?: { transcript?: string }
): Promise<string[]> {
  const platformCount: Record<Platform, number> = {
    facebook: 2,
    linkedin: 4,
    instagram: 8,
    tiktok: 4,
    youtube: 4,
  };
  const targetCount = Math.min(count, platformCount[platform]);

  const system = `You suggest hashtags that real people search and use — NOT generic SEO bait. Output a JSON array of strings only — no preamble, no markdown, no commentary.

CRITICAL — TOPIC ACCURACY OVER POPULARITY:
- Read the transcript carefully and identify the ACTUAL topic. Cricket clips need cricket hashtags. Cooking clips need cooking hashtags. NEVER suggest tags from a different domain.
- If you're unsure of the topic, return fewer hashtags rather than guessing wrong. A wrong hashtag is much worse than no hashtag — it puts the post in front of the wrong audience and tanks reach.
- If the source mentions specific names (athletes, teams, products, places, events), prefer hashtags that include those proper nouns — they're discoverable and accurate.

Rules:
- Mix: 30% broad (high-volume topic tag), 70% niche (specific to the actual subject)
- For ${platform}, use exactly ${targetCount} hashtags
- Each starts with #, no spaces, lowercase preferred (proper-noun tags can keep capitals like #ViratKohli)
- NEVER use generic noise: #love #instagood #photooftheday #beautiful #happy #fashion #picoftheday #follow #like4like #instadaily
- DO NOT include #shorts unless platform is youtube (it's irrelevant elsewhere and looks lazy)
- Match the actual content, not the platform name (don't suggest #instagram on instagram)`;

  const transcriptBlock = context?.transcript
    ? `\n\nTranscript (THE PRIMARY SIGNAL — read this carefully to identify the actual topic):\n"""\n${context.transcript.slice(0, 1500)}\n"""`
    : "";

  const prompt = `Caption / hook:
"""
${caption}
"""${transcriptBlock}

Identify the actual topic from the transcript above. Output a JSON array of ${targetCount} accurate, topic-matched hashtags: ["#tag1", "#tag2", ...]`;

  const raw = await generate(prompt, system, {
    temperature: 0.4,
    format: "json",
    maxTokens: 200,
  });

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((t): t is string => typeof t === "string" && t.startsWith("#"))
        .slice(0, targetCount);
    }
  } catch {
    // fall through
  }
  return raw
    .split(/[\s,]+/)
    .filter((t) => t.startsWith("#"))
    .slice(0, targetCount);
}

export type ParsedIntent =
  | { kind: "post"; platforms: Platform[]; caption: string; scheduledFor?: string }
  | { kind: "status" }
  | { kind: "help" }
  | { kind: "connect"; platform?: Platform }
  | { kind: "unknown"; text: string };

export async function parseIntent(message: string): Promise<ParsedIntent> {
  const system = `You parse messages from a social-media-poster's WhatsApp into structured commands. Output JSON only — no preamble, no markdown.

Schema:
- {"kind":"post","platforms":["linkedin","instagram",...],"caption":"...","scheduledFor":"ISO-8601 or null"}
- {"kind":"status"}  — user wants to see recent posts/stats
- {"kind":"help"}  — user asked for help/commands
- {"kind":"connect","platform":"linkedin"}  — user wants to connect an account
- {"kind":"unknown","text":"<original>"}  — none of the above`;

  const prompt = `Message: """${message}"""

Output the JSON.`;
  const raw = await generate(prompt, system, {
    temperature: 0.2,
    format: "json",
  });
  try {
    return JSON.parse(raw) as ParsedIntent;
  } catch {
    return { kind: "unknown", text: message };
  }
}

export async function generateCaptionFromImage(
  imageBase64: string,
  platform: Platform,
  tone: string = "friendly",
  extraContext?: string
): Promise<string> {
  const system = `${COPYWRITER_ROLE}

${FEW_SHOT_BAD_VS_GOOD}

PLATFORM RULES:
${PLATFORM_BRIEFS[platform]}

CRITICAL FOR IMAGE CAPTIONS:
1. DO NOT describe what you see. ("A woman holding a coffee" — banned.)
2. Identify the marketable moment, vibe, or product in the image — then SELL IT.
3. Write like the person/brand in the image is paying you to make people want what they have.
4. The image gives you context. The caption converts that context into desire, emotion, or intrigue.
5. Treat yourself as a viral copywriter who happens to have seen the image — not a vision model proving it can see.`;

  const prompt = `Tone: ${tone}
${extraContext ? `\nExtra context from the user (use this — it's the angle they want): ${extraContext}\n` : ""}
Look at the image, find the marketable moment, then write the caption.

Pick ONE hook framework. Be specific to what you see, but DON'T describe it. SELL it.

Write the caption now.`;

  return generate(prompt, system, {
    temperature: 0.7,
    maxTokens: 600,
    images: [imageBase64],
  });
}

export type Mood =
  | "energetic"
  | "chill"
  | "dramatic"
  | "hopeful"
  | "motivational"
  | "comedic"
  | "urgent"
  | "neutral";

const MOODS: Mood[] = [
  "energetic",
  "chill",
  "dramatic",
  "hopeful",
  "motivational",
  "comedic",
  "urgent",
  "neutral",
];

export async function pickMood(
  transcript: string,
  hookTitle?: string
): Promise<Mood> {
  const system = `You classify a short video clip's mood for background music selection. Output JSON only: {"mood":"<one of: energetic, chill, dramatic, hopeful, motivational, comedic, urgent, neutral>"}.

Mood guide:
- energetic: high-energy stories, fast pacing, exciting reveals
- chill: relaxed conversation, philosophical musings, slower delivery
- dramatic: heavy topics, intense moments, big stakes
- hopeful: positive transformation, success stories, uplifting messages
- motivational: tactical advice, "you can do this", call-to-action
- comedic: jokes, light banter, absurd takes
- urgent: warnings, "don't make this mistake", time-sensitive
- neutral: informational, doesn't fit other categories — use sparingly

Output ONLY the JSON. No preamble.`;

  const prompt = `${hookTitle ? `Hook: "${hookTitle}"\n\n` : ""}Transcript: """${transcript.slice(0, 1500)}"""

Output the JSON.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.2,
      maxTokens: 60,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { mood?: string };
    if (parsed.mood && (MOODS as string[]).includes(parsed.mood)) {
      return parsed.mood as Mood;
    }
  } catch {
    // fall through
  }
  return "neutral";
}

export type EmphasisMoment = {
  /** Seconds into the clip (relative, 0 = clip start). */
  atSec: number;
  /** What's said at that moment — for debug/UI. */
  text: string;
};

export async function pickEmphasisMoments(
  segments: Array<{ start: number; end: number; text: string }>,
  clipStart: number,
  clipEnd: number,
  maxMoments: number = 2
): Promise<EmphasisMoment[]> {
  // Build clip-local transcript with timestamps
  const lines = segments
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => {
      const localStart = Math.max(0, s.start - clipStart);
      return `[${localStart.toFixed(1)}s] ${s.text.trim()}`;
    })
    .join("\n");

  if (lines.length === 0) return [];

  const system = `You identify emphasis moments in a short video clip — points where the speaker delivers a punch line, key statistic, dramatic claim, or "stop and listen" beat. These moments get a punch-zoom + impact sound in the edit.

Pick at MOST ${maxMoments} moments. Quality over quantity — only pick moments that genuinely land. If nothing in the clip is a strong emphasis moment, return an empty array.

Output STRICT JSON only:
{"moments": [{"atSec": <number>, "text": "<short snippet of what's said>"}]}

Rules:
- atSec is the START of the emphasis word/phrase (not the segment start)
- Spread moments out: don't pick two within 3 seconds of each other
- atSec MUST be between 0.5 and ${(clipEnd - clipStart - 1).toFixed(1)} (give the moment room before clip ends)
- No preamble, no markdown fences, just the JSON.`;

  const prompt = `Clip transcript (timestamps relative to clip start):
${lines}

Output the JSON.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.3,
      maxTokens: 400,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { moments?: unknown };
    if (!Array.isArray(parsed.moments)) return [];
    return parsed.moments
      .filter(
        (m): m is EmphasisMoment =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as { atSec?: unknown }).atSec === "number" &&
          typeof (m as { text?: unknown }).text === "string"
      )
      .map((m) => ({
        atSec: Math.max(0.5, Math.min(clipEnd - clipStart - 1, m.atSec)),
        text: m.text.slice(0, 100),
      }))
      .slice(0, maxMoments);
  } catch {
    return [];
  }
}

export type BrollMomentPick = {
  /** Output-timeline seconds when the B-roll should appear (>= 4 to avoid hook). */
  startSec: number;
  /** Output-timeline seconds when it should disappear. */
  endSec: number;
  /** Search query — what to find a visual of. Be specific. */
  query: string;
  /** Hint for which source to prefer. */
  type: "person" | "place" | "thing" | "event";
};

export async function pickBrollMoments(
  segments: Array<{ start: number; end: number; text: string }>,
  clipStart: number,
  clipEnd: number,
  maxMoments: number = 3
): Promise<BrollMomentPick[]> {
  const lines = segments
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => {
      const localStart = Math.max(0, s.start - clipStart);
      const localEnd = Math.min(clipEnd - clipStart, s.end - clipStart);
      return `[${localStart.toFixed(1)}-${localEnd.toFixed(1)}s] ${s.text.trim()}`;
    })
    .join("\n");

  if (lines.length === 0) return [];

  const clipDur = clipEnd - clipStart;
  const minStart = 4.5; // Hook overlay occupies first ~4s
  const maxEnd = clipDur - 0.5;

  const system = `You identify moments in a short video clip where the speaker mentions a CONCRETE, VISUAL subject — and adding a small reference image in the corner would make the clip more engaging.

ONLY pick moments with subjects that have an obvious visual representation:
- Named PEOPLE ("Elon Musk", "Marie Curie")
- Named PLACES ("Eiffel Tower", "Tokyo", "Mount Everest")
- THINGS / objects ("Tesla Model S", "MacBook Pro", "ancient sword")
- Historical EVENTS ("Apollo 11 landing", "fall of Rome")
- Named TECHNIQUES / METHODS that have a Wikipedia article ("Rembrandt lighting", "Pomodoro technique", "Heimlich maneuver")
- Software / tools that are widely known ("Adobe Premiere Pro", "Photoshop", "Excel")

DO NOT pick:
- Abstract concepts ("freedom", "happiness", "the economy")
- Opinions / philosophy / advice
- Vague generic terms ("a guy", "stuff", "things people do")
- The speaker's own opinion or emotion
- Anything that wouldn't have a clear single Wikipedia / stock photo result

CRITICAL — the search query must be SEARCHABLE on Wikipedia / stock photo sites:
- Prefer the WELL-KNOWN GENERIC TERM over a brand-specific product name.
  GOOD: "softbox", "studio lighting", "ring light"
  BAD: "Mount Dog Softbox Lighting Kit", "Neewer 660 LED"
- Prefer the COMMON NAME over a hyper-specific model.
  GOOD: "Sony A7 IV", "iPhone 16"
  BAD: "Sony Alpha 7 IV body only with 28-70mm kit"
- If the speaker mentions an obscure brand AND a generic term, pick the generic.
- 2-4 words MAX. Be ruthless.

Quality over quantity. If nothing in the clip is genuinely showable with a well-known searchable term, return an empty array. Pick AT MOST ${maxMoments} moments.

Output STRICT JSON only:
{"moments": [{"startSec": <number>, "endSec": <number>, "query": "<2-4 word search phrase>", "type": "person"|"place"|"thing"|"event"}]}

Rules:
- startSec MUST be >= ${minStart.toFixed(1)} (the hook occupies the first ${minStart}s)
- endSec MUST be <= ${maxEnd.toFixed(1)}
- Each moment should last 2.5–4.5 seconds
- Spread moments out: at least 3 seconds between consecutive moments
- "query" should be 2–4 words, optimized for Wikipedia search (no filler, no brand-specific jargon)
- No preamble, no markdown, just JSON.`;

  const prompt = `Clip transcript (timestamps relative to clip start):
${lines}

Output the JSON.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.3,
      maxTokens: 600,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { moments?: unknown };
    if (!Array.isArray(parsed.moments)) return [];

    const out: BrollMomentPick[] = [];
    for (const m of parsed.moments) {
      if (
        typeof m !== "object" ||
        m === null ||
        typeof (m as { startSec?: unknown }).startSec !== "number" ||
        typeof (m as { endSec?: unknown }).endSec !== "number" ||
        typeof (m as { query?: unknown }).query !== "string" ||
        typeof (m as { type?: unknown }).type !== "string"
      ) {
        continue;
      }
      const moment = m as BrollMomentPick;
      const startSec = Math.max(minStart, Math.min(maxEnd - 1, moment.startSec));
      const endSec = Math.max(startSec + 2, Math.min(maxEnd, moment.endSec));
      const query = moment.query.trim().slice(0, 80);
      if (!query) continue;
      const type = (["person", "place", "thing", "event"] as const).includes(
        moment.type as never
      )
        ? moment.type
        : "thing";
      // Enforce 3s spacing from previous accepted moment
      if (out.length > 0 && startSec - out[out.length - 1].endSec < 3) continue;
      out.push({ startSec, endSec, query, type });
      if (out.length >= maxMoments) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function scoreBrollImageMatch(
  imageBase64: string,
  query: string
): Promise<number> {
  const system = `You score how well an image matches a search query for use as a contextual B-roll reference. Output JSON only.

Schema: {"score": 0-10, "reason": "<short>"}

Scoring guide:
- 10: Image is exactly what query describes (e.g., "Eiffel Tower" → photo of Eiffel Tower)
- 7-9: Image clearly depicts the subject, even if not the most iconic shot
- 4-6: Image is related but ambiguous or generic
- 0-3: Image is unrelated, low-quality, or misleading

Be strict. Better to reject a mediocre match than show a confusing image.`;

  const prompt = `Search query: "${query}"
Score how well this image matches.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.1,
      maxTokens: 100,
      format: "json",
      images: [imageBase64],
    });
    const parsed = JSON.parse(raw) as { score?: unknown };
    if (typeof parsed.score === "number") {
      return Math.max(0, Math.min(10, parsed.score));
    }
  } catch {
    // fall through
  }
  return 0;
}

export async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// EXPLAINER MODE — analyze transcript → key insights → narration scripts.
// Used by the EXPLAINER pipeline (vs CLIP) which generates original commentary
// videos with our voice + silent source cutaways. See lib/clipper/explainer.ts.
// ============================================================================

/** What to show on screen for one narration line. The pipeline allocator
 *  uses this to choose between a topic-relevant image (Wikipedia / Pexels
 *  / Pixabay), an AI-generated image (fal.ai for abstract concepts), or
 *  fall back to a source-video segment. Driven by Gemma per-line because
 *  ONLY Gemma knows what the line is "about". */
export type LineVisual = {
  /** "image" = search a real photo via the broll system. "ai" = generate
   *  via fal.ai (used sparingly — capped at 2 per explainer for cost +
   *  quality). "source" = use a source-video segment (anchor moments). */
  kind: "image" | "ai" | "source";
  /** Search query for "image" (e.g., "Tesla factory", "Elon Musk").
   *  Or AI prompt for "ai" (e.g., "abstract automation concept,
   *  futuristic, cinematic"). Empty for "source". */
  query: string;
  /** Visual entity type for ranking image-source preference (Wikipedia
   *  for proper nouns, Pexels/Pixabay for generic things). */
  type: "person" | "place" | "thing" | "event" | "concept";
};

/**
 * Per-line visual planner. Reads each narration line + the broader
 * insight, decides what would be the BEST visual for that line.
 *
 * Bias: prefer real images of named subjects (illustrates the FACT).
 * Use AI generation only for abstract concepts no photo exists for.
 * Mark a few lines as "source" so we anchor with brief speaker shots
 * for authenticity (the pipeline enforces opening/middle/closing
 * source anchors as a hard rule on top of this).
 */
export async function planLineVisuals(
  insight: { title: string; takeaway: string },
  scriptLines: { text: string }[],
): Promise<LineVisual[]> {
  if (scriptLines.length === 0) return [];

  const numbered = scriptLines
    .map((l, i) => `${i + 1}. ${l.text}`)
    .join("\n");

  const system = `You are the visual director for a documentary-style explainer Short. For each narration line, you decide WHAT THE VIEWER SHOULD SEE — almost never the host's face.

═══════════════════════════════════════════════════
THE GOAL
═══════════════════════════════════════════════════

Viewers tune out fast when they see the same person talking. We are NOT making a clip channel — we are making a documentary. Each narration line should be illustrated with what's BEING DISCUSSED:
  - "Elon talks about Mars" → photo of Mars, NOT Elon's face
  - "Tesla's factory" → photo of a Tesla factory
  - "the auction floor" → photo of a cricket auction or similar
  - "complexity kills companies" → abstract image (tangled wires, broken machinery)

═══════════════════════════════════════════════════
THE THREE VISUAL KINDS
═══════════════════════════════════════════════════

  "image" — A REAL photo searchable on Wikipedia / Pexels / Pixabay.
    Use when narration mentions a NAMED person, place, thing, or event
    that has a known visual.
    Examples: "Elon Musk" → image. "Tokyo" → image. "Tesla Cybertruck"
    → image. "the IPL trophy" → image.

  "ai" — AI-generated image for ABSTRACT concepts no photo exists for.
    Use SPARINGLY (cap is 2 per explainer). Examples: "complexity",
    "the new economy", "uncertainty", "automation in 5 years".
    The "query" should be a vivid AI image prompt (e.g., "tangled
    wires growing into a forest, dark cinematic, 9:16").

  "source" — A short clip from the source video (the host on screen).
    Use ONLY when the line is META about the speaker (e.g., "what
    Elon is REALLY saying here is...") or for a single mid-script
    "they actually said this" anchor moment. PICK AT MOST 2 lines
    as "source" — the pipeline adds opener + closer source anchors
    automatically on top of these.

═══════════════════════════════════════════════════
QUERY FORMATTING (image type)
═══════════════════════════════════════════════════

Keep search queries 2-4 WORDS. Searchable on Wikipedia.
  ✅ "Elon Musk", "Tesla Gigafactory", "cricket auction", "stock market crash"
  ❌ "Elon Musk talking about Mars during interview"
  ❌ "stuff related to AI agents"

If a noun in the line has a Wikipedia article, that's the query.

═══════════════════════════════════════════════════
BRANDS / PRODUCTS / PLATFORMS — USE THE LOGO
═══════════════════════════════════════════════════

When the line mentions a real software product, AI tool, company, or
platform (Claude, ChatGPT, OpenAI, Anthropic, ElevenLabs, Adobe, Google,
Microsoft, Apple, Meta, Premiere Pro, Final Cut, DaVinci Resolve,
Midjourney, Stable Diffusion, Runway, fal.ai, Notion, Figma, GitHub,
YouTube, TikTok, Instagram, etc.), the query MUST be:

  "{Brand name} logo"

  ✅ "Claude logo", "ElevenLabs logo", "Premiere Pro logo", "OpenAI logo"
  ❌ "AI assistant talking" (when line mentions Claude — viewer expects the LOGO)
  ❌ "video editor screen" (when line mentions Premiere Pro — use the actual logo)

This makes the explainer feel REAL. Random stock photos for brand
mentions break trust. The viewer sees "Claude" in the captions and
expects to see Claude's logo, not a generic chatbot stock photo.

If the line shows the brand DOING something specific (e.g., "Claude
generating code"), pick a screenshot-style query: "Claude interface" or
"ChatGPT screenshot". Otherwise default to "{Brand} logo".

═══════════════════════════════════════════════════
TYPE FIELD
═══════════════════════════════════════════════════

  "person" — named human ("Elon Musk", "Naval Ravikant")
  "place" — geographic location ("Mars", "Tokyo", "the SpaceX HQ")
  "thing" — object / brand / generic noun ("Cybertruck", "softbox", "AI agent")
  "event" — historical or news event ("2008 crash", "IPL 2025 final")
  "concept" — abstract idea ("automation", "freedom", "complexity") → ALWAYS pair with kind="ai"

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

STRICT JSON only. One entry per script line, IN ORDER:
{"visuals": [{"kind": "image"|"ai"|"source", "query": "...", "type": "person"|"place"|"thing"|"event"|"concept"}]}

  - Length MUST equal the number of script lines (${scriptLines.length}).
  - "ai" entries: max 2 per explainer.
  - "source" entries: max 2 per explainer (you can pick 0 if no line
    is meta — pipeline adds anchors anyway).
  - Default to "image" — if you're unsure, find a noun in the line and
    use that as the query.

No preamble, no markdown.`;

  const prompt = `Insight: ${insight.title}
Takeaway: ${insight.takeaway}

Narration script (${scriptLines.length} lines):
${numbered}

Return ${scriptLines.length} visuals as JSON, one per line, in order.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.35,
      maxTokens: 1500,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { visuals?: unknown };
    if (!Array.isArray(parsed.visuals)) return scriptLines.map(fallbackVisual);

    const out: LineVisual[] = [];
    for (let i = 0; i < scriptLines.length; i++) {
      const v = (parsed.visuals as unknown[])[i];
      if (
        typeof v !== "object" || v === null ||
        typeof (v as { kind?: unknown }).kind !== "string" ||
        typeof (v as { query?: unknown }).query !== "string" ||
        typeof (v as { type?: unknown }).type !== "string"
      ) {
        out.push(fallbackVisual(scriptLines[i]));
        continue;
      }
      const lv = v as LineVisual;
      const kind: LineVisual["kind"] =
        lv.kind === "image" || lv.kind === "ai" || lv.kind === "source"
          ? lv.kind
          : "image";
      const type: LineVisual["type"] =
        lv.type === "person" || lv.type === "place" || lv.type === "thing" ||
        lv.type === "event" || lv.type === "concept"
          ? lv.type
          : "thing";
      out.push({
        kind,
        query: lv.query.trim().slice(0, 120),
        type,
      });
    }

    // Enforce hard caps in JS in case Gemma over-budgeted
    let aiCount = 0;
    let sourceCount = 0;
    for (const v of out) {
      if (v.kind === "ai") {
        aiCount++;
        if (aiCount > 2) v.kind = "image";
      } else if (v.kind === "source") {
        sourceCount++;
        if (sourceCount > 2) v.kind = "image";
      }
    }

    return out;
  } catch (err) {
    console.warn("[planLineVisuals] failed:", err);
    return scriptLines.map(fallbackVisual);
  }
}

/** Fallback when Gemma fails — derive a naive search query from the line. */
function fallbackVisual(line: { text: string }): LineVisual {
  const words = line.text
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5)
    .slice(0, 2);
  return {
    kind: "image",
    query: words.join(" ") || "documentary",
    type: "thing",
  };
}

export type Insight = {
  /** Short, punchy title for the explainer video (max ~70 chars). Will
   *  also be used as the YouTube title with #Shorts appended. */
  title: string;
  /** 1-2 sentence summary of the insight. Becomes the seed for the
   *  full narration script written by writeExplainerScript(). */
  takeaway: string;
  /** Source timestamp range (seconds) where this insight is discussed.
   *  Lets us prefer source-aligned cutaways over random ones. */
  startSec: number;
  endSec: number;
  /** 1-10. Higher = more counterintuitive/contrarian/quotable.
   *  Drives the order in the UI. */
  punchScore: number;
};

/**
 * Read the full transcript of a podcast/interview/talk and return N stand-alone
 * insights, each of which would make a good 30-60s explainer video.
 *
 * An "insight" is NOT a quoted clip — it's something the AI extracts and then
 * narrates in the channel's own voice. That distinction matters: we're looking
 * for *ideas worth explaining*, not lines worth re-airing. Examples:
 *   - "Why Elon thinks Mars colonisation is harder than people realise"
 *   - "The hidden tax that kills 90% of new restaurants in year one"
 *   - "How Naval reframes happiness as a default state, not a goal"
 */
export async function extractInsights(
  transcriptText: string,
  sourceTitle: string | null,
  maxInsights: number = 5,
): Promise<Insight[]> {
  // Cap input — Gemma context window is large but huge transcripts hurt
  // recall + cost. ~25k chars covers ~3hrs of speech; longer sources should
  // chunk before calling here (caller's responsibility).
  const trimmed = transcriptText.slice(0, 25000);
  const titleHint = sourceTitle ? `\nSource title: ${sourceTitle}` : "";

  const system = `You're a senior editor at a viral commentary channel (think Hamish Mckenzie / Tim Urban / "How Money Works" tier). You watch a 1-3 hour podcast/interview transcript and pull out the ${maxInsights} TRULY VIRAL CONCLUSIONS — not "topics discussed" but actual contrarian claims, hidden insights, hot takes, and counterintuitive truths that would make someone STOP scrolling.

═══════════════════════════════════════════════════
CRITICAL: A CONCLUSION ≠ A TOPIC
═══════════════════════════════════════════════════

❌ BAD (a topic, not a conclusion):
  "Elon talks about Mars colonization"
  "How to handle stress"
  "His thoughts on AI"

✅ GOOD (a conclusion that makes a real claim):
  "Most VCs lose money — and the survivors are just lucky, not smart"
  "Mars is 100x harder than the Moon — and we're nowhere near ready"
  "The real reason restaurants fail in year one isn't the food — it's a hidden tax most owners don't see coming"
  "Naval reframes happiness as a default state, not a goal — and explains why most people get this exactly backward"

THE TEST: Read your "title" out loud. Does it make a CLAIM strong enough that someone would argue with you, agree loudly, or want to hear the reasoning? If it just describes a topic, REJECT IT.

═══════════════════════════════════════════════════
WHAT MAKES A "10/10" INSIGHT
═══════════════════════════════════════════════════

It hits at least 2 of these:
  1. CONTRARIAN — pushes back against a common belief ("everyone thinks X, actually Y")
  2. HIDDEN MECHANISM — reveals a non-obvious cause-effect ("the REAL reason X happens is Y")
  3. STAKES + STORY — has a concrete consequence with a vivid detail ("they lost $20M because of one decision")
  4. REFRAMES A CONCEPT — gives the viewer a new mental model ("stop thinking of X as Y, it's actually Z")
  5. SPECIFIC PROOF — has a number, a name, a moment that anchors it ("during the 2008 crash, Buffett bought $5B of Goldman in ONE phone call")

═══════════════════════════════════════════════════
SCORING (BE STRICT — fewer great picks > more weak ones)
═══════════════════════════════════════════════════

  10 = blow-your-mind contrarian, you'd repost it yourself
  8-9 = strong claim with proof — solid viral candidate
  ≤7 = topic-level, vague, "decent" but not viral — REJECT

DEFAULT TO FEWER. A 60-minute podcast typically has 1-3 truly viral
conclusions. Returning 4 is the EXCEPTION, not the rule. Returning 1 is
a perfectly valid answer if the source only has one genuinely contrarian
take. NEVER pad to hit ${maxInsights}. One 9/10 explainer with COMPLETE
detail beats four 7/10 explainers viewers skip past.

═══════════════════════════════════════════════════
SKIP THESE OUTRIGHT
═══════════════════════════════════════════════════
  • Sponsor reads, intros ("welcome back"), outros ("subscribe")
  • Banter, jokes that don't carry an insight
  • Generic motivation ("believe in yourself", "work hard")
  • Personal anecdotes WITHOUT a takeaway claim
  • Anything where the title would be a question with no clear answer

Return STRICT JSON only:
{"insights": [{"title": "<conclusion-form title, max 80 chars>", "takeaway": "<2-sentence claim with the proof or mechanism>", "startSec": <number>, "endSec": <number>, "punchScore": <7-10>}]}

  • title: A CLAIM, not a topic. Make a statement. Lowercase after first word fine.
  • takeaway: 2 sentences max — the claim itself + the proof/mechanism. This is the seed for narration.
  • startSec/endSec: timestamps where the source DISCUSSES this insight (we use these for source-aligned visuals).
  • punchScore: 7-10 only. Anything below 7 should not be in your output AT ALL.
  • Skip filler / banter / sponsor reads.

No preamble, no markdown, no explanation. Just JSON.`;

  const prompt = `Transcript:${titleHint}
${trimmed}

Return up to ${maxInsights} insights as JSON.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.5,
      maxTokens: 1500,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { insights?: unknown };
    if (!Array.isArray(parsed.insights)) return [];

    const out: Insight[] = [];
    for (const ins of parsed.insights) {
      if (
        typeof ins !== "object" ||
        ins === null ||
        typeof (ins as { title?: unknown }).title !== "string" ||
        typeof (ins as { takeaway?: unknown }).takeaway !== "string" ||
        typeof (ins as { startSec?: unknown }).startSec !== "number" ||
        typeof (ins as { endSec?: unknown }).endSec !== "number" ||
        typeof (ins as { punchScore?: unknown }).punchScore !== "number"
      ) {
        continue;
      }
      const i = ins as Insight;
      // Floor at 8 — Gemma over-pads when the floor sits at 7. We only
      // want VIRAL takes (8/10+), not "decent" content. Better to return
      // 1 great explainer than 4 mediocre ones the user has to skip.
      if (i.punchScore < 8) continue;
      if (i.endSec <= i.startSec) continue;
      out.push({
        title: i.title.trim().slice(0, 100),
        takeaway: i.takeaway.trim().slice(0, 400),
        startSec: i.startSec,
        endSec: i.endSec,
        punchScore: Math.max(1, Math.min(10, Math.round(i.punchScore))),
      });
    }
    return out.slice(0, maxInsights);
  } catch (err) {
    console.warn("[extractInsights] failed:", err);
    return [];
  }
}

export type ScriptLine = {
  /** Sentence/clause to be spoken by TTS. ~5-15 words. */
  text: string;
  /** Optional hint for the visual layer. Either a description of an
   *  ideal source moment ("Elon laughing at the Mars question") OR a
   *  generic visual cue ("wide shot, no specific moment needed"). The
   *  segment picker uses this to decide aligned-vs-filler cutaway. */
  visualHint: string;
};

/**
 * Given a single Insight + the surrounding transcript context, write a
 * 60-75s narration script as a list of short lines. Each line is a TTS
 * unit (~one sentence) with an optional visual hint that tells the
 * source-segment picker what would be the ideal cutaway visual.
 *
 * The script speaks IN THE FIRST PERSON of the channel — not the source
 * speaker. e.g. "Elon said this thing — here's why it's actually wrong."
 */
export async function writeExplainerScript(
  insight: Insight,
  transcriptContext: string,
  channelStyle: "energetic" | "analytical" | "storytelling" = "energetic",
): Promise<ScriptLine[]> {
  const styleGuide = {
    energetic:
      "Write with HIGH energy — short punchy sentences, conversational, MrBeast-meets-Naval. Use 1-2 word stingers ('Wild.' 'Massive.'). Drive the viewer forward.",
    analytical:
      "Write like a calm explainer — Vox / CGP Grey style. Clear, measured, lots of 'here's the thing' phrasing. No hype words.",
    storytelling:
      "Write like a story — set up tension, reveal, payoff. Conversational. 'So picture this…' 'And then…'.",
  }[channelStyle];

  const system = `You write 60-75 second narration scripts for AI-narrated explainer Shorts. Output is read aloud by a TTS engine, so write the way it SOUNDS, not the way it would read on a page.

${styleGuide}

═══════════════════════════════════════════════════
STRUCTURE — every script must follow this 4-beat arc
═══════════════════════════════════════════════════

  BEAT 1 — HOOK (lines 1-2, ~5-7 seconds)
    Open with the contrarian claim or hidden mechanism. NEVER:
      ❌ "Today we're going to talk about…"
      ❌ "In this video I'll explain…"
      ❌ "Let's dive into…"
    Always:
      ✅ "Here's the wild part. Most people think X — they're wrong."
      ✅ "There's a hidden tax that kills 90% of restaurants. Almost nobody talks about it."
      ✅ "Elon just admitted the one thing every Mars believer has been ignoring."

  BEAT 2 — TENSION (lines 3-7, ~15-20 sec)
    Build the case. Specific details, names, numbers, the "what makes this real."
    Use 1-2 word punch sentences for emphasis: "Massive." "And it gets worse."
    DO NOT skim — give the full context. Specifics make it stick.

  BEAT 3 — REVEAL (lines 8-13, ~20-25 sec)
    Drop the actual insight + the proof. The "here's why" moment.
    Walk through the mechanism step by step. Don't summarize — explain.
    A viewer who finishes this beat should feel they UNDERSTAND now,
    not just that they heard a hot take.

  BEAT 4 — PAYOFF (lines 14-17, ~10 sec)
    A punchline OR a "here's why this matters" landing. Memorable.
    Tie it back to the hook so the loop closes. Maybe a "what now"
    implication. NEVER end on "subscribe for more." End on the IDEA.

═══════════════════════════════════════════════════
LANGUAGE RULES — what makes it NOT sound AI-generated
═══════════════════════════════════════════════════

- VARY sentence length aggressively. Long. Short. Then medium. Like that.
- Use "But." "And." "Now." as one-word sentences for impact.
- NO formal connectives ("furthermore", "moreover", "in conclusion") — banned.
- NO "interestingly", "notably", "fascinatingly" — corporate-AI tells.
- USE concrete numbers, names, places when the takeaway has them. Vague = forgettable.
- Refer to the source speaker by name ("Elon argues that…", "Naval reframes it as…").
- DO NOT quote them word-for-word — paraphrase. We're commentary.
- Skip "um", "you know". Every word earns its place.
- No emojis (spoken aloud, remember).
- Aim for 14-18 lines total — that's 60-75 seconds of audio at natural narration speed. DO NOT undershoot — viewers came for an explanation, give them the whole thing.

═══════════════════════════════════════════════════
EVERY LINE GETS A VISUAL HINT
═══════════════════════════════════════════════════

For each line, write a 3-10 word "visualHint" — what the viewer should see during this sentence:
  ✅ "close-up of speaker mid-pause"
  ✅ "wide shot speaker laughing"
  ✅ "any reaction shot"
  ✅ "static title card"
  ✅ "the moment the speaker raises hand"
  ❌ "a beautiful montage of inspirational moments showing the journey of an entrepreneur"

═══════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════

STRICT JSON only:
{"lines": [{"text": "<one sentence>", "visualHint": "<3-10 word cue>"}]}

No preamble, no markdown, no explanation. Just JSON.`;

  const prompt = `Insight to explain:
Title: ${insight.title}
Takeaway: ${insight.takeaway}

Source transcript context (the moment in the source where this is discussed):
${transcriptContext.slice(0, 4000)}

Write the script. JSON only.`;

  try {
    const raw = await generate(prompt, system, {
      temperature: 0.85,
      maxTokens: 1200,
      format: "json",
    });
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return [];

    const out: ScriptLine[] = [];
    for (const ln of parsed.lines) {
      if (
        typeof ln !== "object" ||
        ln === null ||
        typeof (ln as { text?: unknown }).text !== "string"
      ) {
        continue;
      }
      const l = ln as ScriptLine;
      const text = l.text.trim();
      if (text.length < 3) continue;
      out.push({
        text,
        visualHint: typeof l.visualHint === "string" ? l.visualHint.trim().slice(0, 80) : "",
      });
    }
    return out.slice(0, 22);
  } catch (err) {
    console.warn("[writeExplainerScript] failed:", err);
    return [];
  }
}
