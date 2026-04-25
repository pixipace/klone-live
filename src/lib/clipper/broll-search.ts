/**
 * B-roll search across free sources. Wikipedia/Wikimedia work without any
 * key. Pexels + Pixabay kick in opportunistically when their respective
 * API keys are present in env.
 */

import { writeFile, mkdir, readdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export type BrollImageHit = {
  /** Source identifier — "wikipedia" | "wikimedia" | "pexels" | "pixabay" */
  source: string;
  /** Direct URL to the full-resolution image. */
  url: string;
  /** Required attribution string for the caption (Wikimedia, Pixabay, etc.). */
  attribution: string | null;
  /** Pixel width if known — used to skip tiny thumbnails. */
  width?: number;
  /** Pixel height if known. */
  height?: number;
};

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "KloneClipper/1.0 (https://klone.live; hello@klone.live)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Wikipedia REST: page summary returns a clean lead thumbnail for any
 * article. Best for proper nouns (people, places, named events). No key
 * required. Returns null if no thumbnail or page doesn't exist.
 */
async function searchWikipedia(query: string): Promise<BrollImageHit | null> {
  // Step 1: search for best matching page title
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=1&format=json&origin=*`;
  let pageTitle: string | null = null;
  try {
    const sr = await fetchWithTimeout(searchUrl);
    if (!sr.ok) return null;
    const sd = (await sr.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    pageTitle = sd.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
  if (!pageTitle) return null;

  // Step 2: get page summary (includes originalimage)
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle.replace(/ /g, "_")
  )}`;
  try {
    const r = await fetchWithTimeout(summaryUrl);
    if (!r.ok) return null;
    const d = (await r.json()) as {
      title?: string;
      originalimage?: { source?: string; width?: number; height?: number };
      thumbnail?: { source?: string; width?: number; height?: number };
    };
    const img = d.originalimage ?? d.thumbnail;
    if (!img?.source) return null;
    // Skip ultra-tiny images (icons, flags) that won't look good in PiP
    if ((img.width ?? 0) < 300) return null;
    return {
      source: "wikipedia",
      url: img.source,
      attribution: `Wikipedia: ${d.title ?? pageTitle}`,
      width: img.width,
      height: img.height,
    };
  } catch {
    return null;
  }
}

/**
 * Pexels Photo Search — broad stock library. Free tier is generous. Only
 * called when PEXELS_API_KEY is set in env.
 */
async function searchPexels(query: string): Promise<BrollImageHit | null> {
  if (!PEXELS_API_KEY) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=3&orientation=portrait`;
  try {
    const r = await fetchWithTimeout(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as {
      photos?: Array<{
        src?: { large2x?: string; large?: string; original?: string };
        width?: number;
        height?: number;
        photographer?: string;
      }>;
    };
    const photo = d.photos?.[0];
    if (!photo?.src) return null;
    const imgUrl = photo.src.large2x ?? photo.src.large ?? photo.src.original;
    if (!imgUrl) return null;
    return {
      source: "pexels",
      url: imgUrl,
      attribution: `Photo: ${photo.photographer ?? "Pexels"} / Pexels`,
      width: photo.width,
      height: photo.height,
    };
  } catch {
    return null;
  }
}

/**
 * Pixabay Photo Search — alternative broad stock library. Only called when
 * PIXABAY_API_KEY is set.
 */
async function searchPixabay(query: string): Promise<BrollImageHit | null> {
  if (!PIXABAY_API_KEY) return null;
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(
    PIXABAY_API_KEY
  )}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=3&safesearch=true`;
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return null;
    const d = (await r.json()) as {
      hits?: Array<{
        largeImageURL?: string;
        webformatURL?: string;
        imageWidth?: number;
        imageHeight?: number;
        user?: string;
      }>;
    };
    const hit = d.hits?.[0];
    if (!hit) return null;
    const imgUrl = hit.largeImageURL ?? hit.webformatURL;
    if (!imgUrl) return null;
    return {
      source: "pixabay",
      url: imgUrl,
      attribution: `Image: ${hit.user ?? "Pixabay"} / Pixabay`,
      width: hit.imageWidth,
      height: hit.imageHeight,
    };
  } catch {
    return null;
  }
}

/**
 * Multi-source search with type-aware ordering. Returns up to 3 candidates
 * (different sources) so the quality gate has options to pick from.
 */
export async function searchBroll(
  query: string,
  type: "person" | "place" | "thing" | "event"
): Promise<BrollImageHit[]> {
  // Wikipedia is best for named entities; Pexels/Pixabay for generic things.
  const order: Array<() => Promise<BrollImageHit | null>> =
    type === "person" || type === "event"
      ? [() => searchWikipedia(query), () => searchPexels(query), () => searchPixabay(query)]
      : type === "place"
        ? [() => searchWikipedia(query), () => searchPexels(query), () => searchPixabay(query)]
        : [() => searchPexels(query), () => searchPixabay(query), () => searchWikipedia(query)];

  const results = await Promise.all(order.map((fn) => fn().catch(() => null)));
  return results.filter((r): r is BrollImageHit => r !== null);
}

/**
 * Local cache for downloaded images. Keyed by SHA-1 of the source URL so
 * the same media across jobs reuses the cached file. Lives at
 * .uploads/broll-cache/.
 */
const CACHE_ROOT = path.join(process.cwd(), ".uploads", "broll-cache");

export async function downloadToCache(imageUrl: string): Promise<string | null> {
  await mkdir(CACHE_ROOT, { recursive: true });
  const hash = crypto.createHash("sha1").update(imageUrl).digest("hex");
  const ext = guessExt(imageUrl);
  const filename = `${hash}${ext}`;
  const targetPath = path.join(CACHE_ROOT, filename);

  // Cache hit?
  try {
    const files = await readdir(CACHE_ROOT);
    if (files.includes(filename)) return targetPath;
  } catch {
    // dir may not exist on first call — created above already
  }

  try {
    const r = await fetchWithTimeout(imageUrl);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 4000) return null; // too small, probably error/placeholder
    await writeFile(targetPath, buf);
    return targetPath;
  } catch {
    return null;
  }
}

function guessExt(url: string): string {
  const m = url.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/);
  if (!m) return ".jpg";
  if (m[1] === "jpeg") return ".jpg";
  return `.${m[1]}`;
}
