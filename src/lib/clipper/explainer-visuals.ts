/**
 * Explainer visual allocator — turn a list of LineVisual plans into
 * concrete files the composer can render. Priority (cheapest first):
 *
 *   1. image  — ALWAYS try first. Free Wikipedia/Pexels/Pixabay search
 *               via broll-search.ts, scored with Gemma vision.
 *   2. ai     — Only when free search returned nothing AND Gemma's plan
 *               flagged the concept as "ai" (abstract/un-searchable).
 *               fal.ai flux/schnell ~$0.003/img. Cached by SHA1(prompt).
 *   3. source — Last resort: fall through to a source-video segment
 *               (handled by pickSourceSegments). Marked here as sentinel.
 *
 * Also enforces ANCHOR rule: the FIRST shot, ONE MIDDLE shot, and the
 * LAST shot are forced to "source" so the viewer knows the explainer is
 * about a real video — even if Gemma planned them as image. Without
 * anchors, viewers don't recognize the source and trust drops.
 */

import { writeFile, mkdir, stat } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { searchBroll, downloadToCache } from "./broll-search";
import { scoreBrollImageMatch } from "@/lib/ai";
import type { LineVisual } from "@/lib/ai";

const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY;
const AI_IMAGE_CACHE = path.join(process.cwd(), ".uploads", "ai-image-cache");

/** What the composer needs per script line. */
export type ResolvedVisual =
  | {
      kind: "image" | "ai";
      /** Local file path to a JPG/PNG ready for FFmpeg input. */
      filePath: string;
      /** Optional attribution string for the on-screen credit. */
      attribution?: string | null;
      /** Optional SECOND candidate for multi-shot splitting. When the
       *  narration line is long (>3.5s) the pipeline splits the audio
       *  in half and shows this as the second sub-shot for visual
       *  variety. ColdFusion-style cuts every 1-3s instead of holding
       *  the same image for 5-7s. */
      alternateFilePath?: string;
      alternateAttribution?: string | null;
    }
  | {
      kind: "source";
      /** Pipeline must fill this in via pickSourceSegments. */
    };

// Stricter threshold (was 6) — when free image search returns weak
// matches, the result looks like "random stock photo over narration"
// instead of documentary illustration. Reject anything below 7/10 and
// fall through to source clip — viewers trust the source video more
// than a tangentially-relevant Pexels photo.
const MIN_VISION_SCORE = 7;

// Safety net for the visual planner — if Gemma forgot to add "logo" to a
// known-brand query, we rewrite it here. Wikipedia's article infobox
// almost always has the company logo as the lead image, so "{Brand} logo"
// reliably returns the actual logo. Lowercase keys; matched as substring
// against Gemma's query.
const KNOWN_BRANDS = [
  "claude", "anthropic", "chatgpt", "openai", "gpt-4", "gpt-5", "gpt 4", "gpt 5",
  "elevenlabs", "eleven labs", "fal.ai", "fal ai",
  "midjourney", "stable diffusion", "runway", "pika", "sora",
  "google", "gemini", "deepmind", "youtube",
  "microsoft", "copilot", "azure", "bing",
  "apple", "siri", "vision pro",
  "meta", "facebook", "instagram", "whatsapp",
  "tiktok", "twitter", "x.com",
  "adobe", "premiere pro", "premiere", "after effects", "photoshop", "illustrator",
  "final cut", "davinci resolve", "capcut", "descript",
  "notion", "figma", "github", "vercel", "next.js", "nextjs",
  "linkedin", "spotify", "amazon", "aws", "tesla", "spacex",
];

function brandifyQuery(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("logo") || q.includes("screenshot") || q.includes("interface")) {
    return query; // Already brand-aware
  }
  for (const brand of KNOWN_BRANDS) {
    if (q.includes(brand)) {
      // Use the brand from the original query (preserves casing) +
      // " logo" suffix. Wikipedia search is case-insensitive but the
      // attribution string looks better with proper capitalization.
      return `${query} logo`;
    }
  }
  return query;
}

/**
 * Resolve a planned visual to a concrete file path. Returns null if
 * everything fails (caller falls back to source).
 */
async function resolveImage(
  query: string,
  type: LineVisual["type"],
): Promise<{
  filePath: string;
  attribution: string | null;
  alternateFilePath?: string;
  alternateAttribution?: string | null;
} | null> {
  // Map "concept" type to "thing" for broll-search compatibility (the
  // function signature only knows person/place/thing/event).
  const broker: "person" | "place" | "thing" | "event" =
    type === "concept" ? "thing" : type;
  // Brand-aware query rewrite — turns "Claude" into "Claude logo" so we
  // get the actual logo from Wikipedia's article instead of a random
  // chatbot stock photo.
  const finalQuery = brandifyQuery(query);
  if (finalQuery !== query) {
    console.log(`[explainer-visuals] brand detected, rewrote query: "${query}" → "${finalQuery}"`);
  }
  const candidates = await searchBroll(finalQuery, broker);
  if (candidates.length === 0) return null;

  // Try candidates in order. Collect up to 2 that pass the vision
  // gate — primary + alternate for multi-shot splitting on long lines.
  const passers: { filePath: string; attribution: string | null }[] = [];
  for (const hit of candidates.slice(0, 4)) {
    if (passers.length >= 2) break;
    const filePath = await downloadToCache(hit.url);
    if (!filePath) continue;

    let score = 5;
    try {
      const { readFile } = await import("fs/promises");
      const buf = await readFile(filePath);
      const b64 = buf.toString("base64");
      score = await scoreBrollImageMatch(b64, finalQuery);
    } catch {
      // If scoring fails, default to medium and proceed
    }
    if (score >= MIN_VISION_SCORE) {
      passers.push({ filePath, attribution: hit.attribution });
    }
  }
  if (passers.length === 0) return null;
  return {
    filePath: passers[0].filePath,
    attribution: passers[0].attribution,
    alternateFilePath: passers[1]?.filePath,
    alternateAttribution: passers[1]?.attribution,
  };
}

/**
 * Generate an AI image via fal.ai for abstract concept queries.
 * Cached by SHA1(prompt) so identical prompts reuse files across jobs.
 * Returns null if FAL_API_KEY missing or generation fails — caller
 * should fall back to image search or source.
 */
async function generateAiImage(prompt: string): Promise<string | null> {
  if (!FAL_API_KEY) return null;

  const hash = crypto.createHash("sha1").update(prompt).digest("hex");
  const filePath = path.join(AI_IMAGE_CACHE, `${hash}.jpg`);
  // Cache hit
  try {
    await stat(filePath);
    return filePath;
  } catch {
    // Not cached — generate
  }

  await mkdir(AI_IMAGE_CACHE, { recursive: true });

  // fal.ai flux-schnell — fast cheap image generation. ~$0.003 per image.
  // 9:16 aspect = portrait orientation matching our Shorts canvas.
  const fullPrompt = `${prompt}, cinematic, dramatic lighting, 9:16 vertical, photorealistic, no text, no watermark, no logo`;

  try {
    const submitRes = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        image_size: { width: 768, height: 1344 }, // 9:16 portrait
        num_inference_steps: 4,                    // schnell = fast
        num_images: 1,
        enable_safety_checker: true,
      }),
    });
    if (!submitRes.ok) {
      const errBody = await submitRes.text();
      console.warn(`[explainer-visuals] fal.ai submit ${submitRes.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    // fal.ai queue API: submit returns {status_url, response_url, ...}.
    // Poll status_url until status === "COMPLETED" (or capped attempts),
    // then fetch response_url for the actual image data.
    const data = (await submitRes.json()) as {
      status?: string;
      images?: { url: string }[];
      status_url?: string;
      response_url?: string;
    };
    let imageUrl: string | null = null;
    // Sometimes flux/schnell returns inline images on the submit (sync mode)
    if (data.images && data.images.length > 0) {
      imageUrl = data.images[0].url;
    } else if (data.status_url && data.response_url) {
      const responseUrl = data.response_url;
      // Poll status until COMPLETED. flux/schnell typically takes 1-3s.
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollRes = await fetch(data.status_url, {
          headers: { "Authorization": `Key ${FAL_API_KEY}` },
        });
        if (!pollRes.ok) continue;
        const pollData = (await pollRes.json()) as { status?: string };
        if (pollData.status === "COMPLETED") {
          // Fetch the result from response_url (separate endpoint)
          const respRes = await fetch(responseUrl, {
            headers: { "Authorization": `Key ${FAL_API_KEY}` },
          });
          if (respRes.ok) {
            const respData = (await respRes.json()) as { images?: { url: string }[] };
            if (respData.images && respData.images.length > 0) {
              imageUrl = respData.images[0].url;
            }
          }
          break;
        }
        if (pollData.status === "FAILED" || pollData.status === "CANCELLED") {
          break;
        }
      }
    }
    if (!imageUrl) return null;
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    await writeFile(filePath, imgBuf);
    return filePath;
  } catch (err) {
    console.warn(`[explainer-visuals] fal.ai gen failed for "${prompt}":`, err);
    return null;
  }
}

/**
 * Run the visual allocator on a planned list — returns a parallel array
 * of ResolvedVisual entries. The pipeline then takes the "source" slots
 * and fills them via pickSourceSegments.
 *
 * Anchor enforcement:
 *   - shot[0] forced to "source" (opening anchor)
 *   - shot[mid] forced to "source" (middle anchor — at index floor(N/2))
 *   - shot[N-1] forced to "source" (closing anchor)
 *   These overrides happen AFTER Gemma's plan so we always have 3
 *   source anchors per explainer regardless of what Gemma chose.
 */
export async function resolveVisuals(
  plans: LineVisual[],
): Promise<ResolvedVisual[]> {
  const N = plans.length;
  if (N === 0) return [];

  // Anchor indices — clamp to valid range, dedupe.
  const anchorSet = new Set<number>([0, Math.floor(N / 2), N - 1].filter((i) => i >= 0 && i < N));

  const out: ResolvedVisual[] = [];
  for (let i = 0; i < N; i++) {
    const plan = plans[i];
    if (anchorSet.has(i) || plan.kind === "source") {
      out.push({ kind: "source" });
      continue;
    }

    // ALWAYS try free image search first (Wikipedia/Pexels/Pixabay).
    // Gemma's "ai" hint only matters as a fallback signal — if the free
    // sources have something good, we use it. Only escalate to paid
    // fal.ai when free search returned nothing usable AND Gemma flagged
    // the concept as un-searchable.
    try {
      const img = await resolveImage(plan.query, plan.type);
      if (img) {
        out.push({
          kind: "image",
          filePath: img.filePath,
          attribution: img.attribution,
          alternateFilePath: img.alternateFilePath,
          alternateAttribution: img.alternateAttribution,
        });
        continue;
      }
    } catch (err) {
      console.warn(`[explainer-visuals] image search failed for "${plan.query}":`, err);
    }

    // Free search struck out. If Gemma planned "ai", try fal.ai now.
    if (plan.kind === "ai") {
      const aiPath = await generateAiImage(plan.query);
      if (aiPath) {
        out.push({ kind: "ai", filePath: aiPath, attribution: "AI-generated" });
        continue;
      }
    }

    // Last resort: source segment
    out.push({ kind: "source" });
  }
  return out;
}
