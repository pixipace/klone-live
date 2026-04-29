/**
 * Explainer visual allocator — turn a list of LineVisual plans into
 * concrete files the composer can render. Handles three sources:
 *
 *   1. image  — search Wikipedia/Pexels/Pixabay via broll-search.ts,
 *               score with Gemma vision, download to cache.
 *   2. ai     — fal.ai image generation for abstract concepts.
 *               Cached by SHA1(prompt). Hard cap: 2 per explainer.
 *   3. source — fall through to a source-video segment (handled by the
 *               existing pickSourceSegments allocator). Marked here as
 *               sentinel + the pipeline fills the segment in.
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
    }
  | {
      kind: "source";
      /** Pipeline must fill this in via pickSourceSegments. */
    };

const MIN_VISION_SCORE = 6; // 0-10, drop below this

/**
 * Resolve a planned visual to a concrete file path. Returns null if
 * everything fails (caller falls back to source).
 */
async function resolveImage(query: string, type: LineVisual["type"]): Promise<{ filePath: string; attribution: string | null } | null> {
  // Map "concept" type to "thing" for broll-search compatibility (the
  // function signature only knows person/place/thing/event).
  const broker: "person" | "place" | "thing" | "event" =
    type === "concept" ? "thing" : type;
  const candidates = await searchBroll(query, broker);
  if (candidates.length === 0) return null;

  // Try candidates in order — Gemma vision scoring on each downloaded
  // file. First one that scores >= MIN_VISION_SCORE wins.
  for (const hit of candidates.slice(0, 3)) {
    const filePath = await downloadToCache(hit.url);
    if (!filePath) continue;

    // Vision score the downloaded image
    let score = 5;
    try {
      const { readFile } = await import("fs/promises");
      const buf = await readFile(filePath);
      const b64 = buf.toString("base64");
      score = await scoreBrollImageMatch(b64, query);
    } catch {
      // If scoring fails, default to medium and proceed
    }
    if (score >= MIN_VISION_SCORE) {
      return { filePath, attribution: hit.attribution };
    }
  }
  return null;
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
    // schnell synchronous response includes images directly
    const data = (await submitRes.json()) as { images?: { url: string }[]; status_url?: string };
    let imageUrl: string | null = null;
    if (data.images && data.images.length > 0) {
      imageUrl = data.images[0].url;
    } else if (data.status_url) {
      // Async path: poll until done. fal-ai/flux-schnell normally
      // returns synchronous, but handle queue mode just in case.
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollRes = await fetch(data.status_url, {
          headers: { "Authorization": `Key ${FAL_API_KEY}` },
        });
        const pollData = (await pollRes.json()) as { status?: string; images?: { url: string }[]; response_url?: string };
        if (pollData.images && pollData.images.length > 0) {
          imageUrl = pollData.images[0].url;
          break;
        }
        if (pollData.response_url) {
          const respRes = await fetch(pollData.response_url, {
            headers: { "Authorization": `Key ${FAL_API_KEY}` },
          });
          const respData = (await respRes.json()) as { images?: { url: string }[] };
          if (respData.images && respData.images.length > 0) {
            imageUrl = respData.images[0].url;
            break;
          }
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

    if (plan.kind === "ai") {
      const aiPath = await generateAiImage(plan.query);
      if (aiPath) {
        out.push({ kind: "ai", filePath: aiPath, attribution: "AI-generated" });
        continue;
      }
      // Fall through to image search if AI fails
    }

    // image kind (or AI fallback)
    try {
      const img = await resolveImage(plan.query, plan.type);
      if (img) {
        out.push({ kind: "image", filePath: img.filePath, attribution: img.attribution });
        continue;
      }
    } catch (err) {
      console.warn(`[explainer-visuals] image search failed for "${plan.query}":`, err);
    }

    // Last resort: source segment
    out.push({ kind: "source" });
  }
  return out;
}
