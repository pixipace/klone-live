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
  count: number = 8
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

Rules:
- Mix: 30% broad (high-volume), 70% niche (low-volume but targeted)
- For ${platform}, use exactly ${targetCount} hashtags
- Each starts with #, no spaces, lowercase preferred
- NEVER use these tired hashtags: #love #instagood #photooftheday #beautiful #happy #fashion #picoftheday #follow #like4like #instadaily — they're noise
- Match the actual content, not the platform name (don't suggest #instagram on instagram)`;

  const prompt = `Caption:
"""
${caption}
"""

Output a JSON array of ${targetCount} hashtags: ["#tag1", "#tag2", ...]`;

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

export async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
