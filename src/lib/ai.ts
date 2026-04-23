const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";

type Platform = "tiktok" | "facebook" | "instagram" | "linkedin" | "youtube";

type GenerateOptions = {
  temperature?: number;
  maxTokens?: number;
  format?: "json" | "text";
};

async function generate(
  prompt: string,
  system: string,
  opts: GenerateOptions = {}
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      stream: false,
      think: false,
      format: opts.format,
      options: {
        temperature: opts.temperature ?? 0.7,
        num_predict: opts.maxTokens ?? 512,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { message: { content: string } };
  return (data.message?.content ?? "").trim();
}

const PLATFORM_BRIEFS: Record<Platform, string> = {
  linkedin:
    "LinkedIn — professional tone, 1-3 short paragraphs, hook in line 1, line breaks between thoughts. No hashtag spam (3-5 max, end of post).",
  facebook:
    "Facebook — conversational, 1-2 paragraphs, question at the end to drive comments. 0-2 hashtags.",
  instagram:
    "Instagram — punchy first line as hook, short lines, emojis OK but sparing. 5-10 relevant hashtags at the end.",
  tiktok:
    "TikTok — very short caption (under 150 chars), trend-aware, 3-5 hashtags including 1-2 niche tags.",
  youtube:
    "YouTube Shorts — clickable title under 100 chars with #Shorts tag. Short description below if helpful.",
};

export async function generateCaption(
  topic: string,
  platform: Platform,
  tone: string = "friendly"
): Promise<string> {
  const system = `You are a social media copywriter. Write a single post caption for the given platform. Output only the caption text — no preamble, no quotes, no "Here's your caption:".`;
  const prompt = `Platform brief: ${PLATFORM_BRIEFS[platform]}
Tone: ${tone}
Topic: ${topic}

Write the caption.`;
  return generate(prompt, system, { temperature: 0.8 });
}

export async function rewriteForPlatform(
  draft: string,
  platform: Platform
): Promise<string> {
  const system = `You rewrite social media drafts for specific platforms. Output only the rewritten caption — no preamble, no commentary.`;
  const prompt = `Rewrite this draft for ${platform}.
${PLATFORM_BRIEFS[platform]}

Draft:
"""
${draft}
"""

Rewritten caption:`;
  return generate(prompt, system, { temperature: 0.6 });
}

export async function suggestHashtags(
  caption: string,
  platform: Platform,
  count: number = 8
): Promise<string[]> {
  const system = `You suggest relevant, high-discoverability hashtags. Output a JSON array of strings only — no preamble, no markdown.`;
  const prompt = `Suggest ${count} hashtags for this ${platform} post. Mix broad and niche tags. Each hashtag must start with #.

Caption:
"""
${caption}
"""

Output a JSON array like: ["#tag1", "#tag2", ...]`;
  const raw = await generate(prompt, system, {
    temperature: 0.4,
    format: "json",
  });
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // fall through
  }
  return raw
    .split(/[\s,]+/)
    .filter((t) => t.startsWith("#"))
    .slice(0, count);
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

export async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
