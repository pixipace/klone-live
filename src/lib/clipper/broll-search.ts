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
  // No orientation filter — Pixabay's vertical-only search returns ~0 hits
  // for most queries. Renderer crops any aspect ratio to the 378x504 PiP.
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(
    PIXABAY_API_KEY
  )}&q=${encodeURIComponent(query)}&image_type=photo&per_page=3&safesearch=true`;
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
 * Multi-source search with type-aware ordering + automatic query
 * simplification fallback. Returns up to 3 candidates so the quality gate
 * has options to pick from.
 *
 * Fallback chain: try the original query against all configured sources,
 * then if everything came back empty, retry with a simplified query (last
 * 2 words → last 1 word). This rescues moments where Gemma picked a
 * brand-specific name like "Mount Dog Softbox Lighting Kit" — simplifying
 * to "softbox" is enough to land on the Wikipedia page.
 */
export async function searchBroll(
  query: string,
  type: "person" | "place" | "thing" | "event"
): Promise<BrollImageHit[]> {
  const queries = expandQueryWithFallbacks(query);
  for (const q of queries) {
    // Wikipedia is best for named entities; Pexels/Pixabay for generic things.
    const order: Array<() => Promise<BrollImageHit | null>> =
      type === "thing"
        ? [() => searchPexels(q), () => searchPixabay(q), () => searchWikipedia(q)]
        : [() => searchWikipedia(q), () => searchPexels(q), () => searchPixabay(q)];
    const results = await Promise.all(order.map((fn) => fn().catch(() => null)));
    const hits = results.filter((r): r is BrollImageHit => r !== null);
    if (hits.length > 0) {
      if (q !== query) {
        console.log(`[broll] simplified "${query}" → "${q}" → ${hits.length} hit(s)`);
      }
      return hits;
    }
  }
  console.log(`[broll] no hits for "${query}" (tried ${queries.length} variant(s))`);
  return [];
}

/**
 * Build progressively-simpler query variants for fallback retries.
 *   "Mount Dog Softbox Lighting Kit" → [original, "Softbox", "Lighting"]
 * Strategy:
 *   1. Try the original query first (preserves multi-word entities like "Sony A7 IV").
 *   2. If that fails, try each substantive word individually, longest-first
 *      — head nouns like "Softbox" are usually the generic Wikipedia hit.
 * Brand names + numbers + stop-words are filtered out to avoid garbage matches.
 */
function expandQueryWithFallbacks(query: string): string[] {
  const trimmed = query.trim();
  const out = [trimmed];

  const tokens = trimmed
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length <= 1) return out;

  const stopWords = new Set([
    "the", "and", "for", "with", "from", "into", "your", "their", "his", "her",
    "kit", "set", "thing", "stuff", "type", "way", "guy", "one", "model",
    "system", "version", "edition", "series", "official", "best", "new",
    "this", "that", "those", "these", "what", "when", "where", "how", "why",
    "body", "kind", "sort",
  ]);

  // Substantive single-word candidates — drop stopwords, drop tokens that
  // are mostly digits (model numbers like "660" or "A7"), require length > 4
  // (very short words like "led" or "cup" can match unrelated articles).
  const wordCandidates = tokens
    .filter((t) => {
      const lower = t.toLowerCase();
      if (stopWords.has(lower)) return false;
      if (lower.length < 5) return false;
      if (/^\d+$/.test(t)) return false;
      // Brand-y all-caps short words (e.g. LED, USB) caught by length-5 above
      return true;
    })
    .sort((a, b) => b.length - a.length); // longest first

  for (const w of wordCandidates) {
    if (!out.includes(w)) out.push(w);
  }

  return out;
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
