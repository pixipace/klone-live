import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import type { CustomOverlay } from "./explainer-compose";

const SCRIPT = path.join(process.cwd(), "scripts", "render-explainer-graphic.py");
const STAT_ANIM_SCRIPT = path.join(process.cwd(), "scripts", "render-stat-animated.py");
const BAR_ANIM_SCRIPT = path.join(process.cwd(), "scripts", "render-bar-animated.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "/opt/homebrew/bin/python3";

type GraphicCfg =
  | { type: "title"; title: string; subtitle: string; outPath: string }
  | { type: "stat"; value: string; label: string; outPath: string }
  | { type: "pullquote"; text: string; outPath: string };

function spawnRender(cfg: GraphicCfg): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SCRIPT]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`render-explainer-graphic.py exited ${code}: ${stderr.slice(-200)}`)),
    );
    child.on("error", reject);
    child.stdin.write(JSON.stringify(cfg));
    child.stdin.end();
  });
}

/** Render an animated count-up stat as a PNG sequence. Returns the
 *  framePattern + fps the composer needs to play it back. */
function spawnAnimatedStat(args: {
  value: string;
  label: string;
  outDir: string;
  fps: number;
  durationSec: number;
}): Promise<{ framePattern: string; fps: number }> {
  return runFrameRenderer(STAT_ANIM_SCRIPT, args);
}

/** Render an animated comparison bar chart as a PNG sequence. */
function spawnAnimatedBar(args: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  outDir: string;
  fps: number;
  durationSec: number;
}): Promise<{ framePattern: string; fps: number }> {
  return runFrameRenderer(BAR_ANIM_SCRIPT, args);
}

/** Shared subprocess runner for frame-sequence renderers — both stat
 *  counters and bar charts produce the same {framePattern, fps} JSON. */
function runFrameRenderer(
  scriptPath: string,
  cfg: object,
): Promise<{ framePattern: string; fps: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`${scriptPath} exited ${code}: ${stderr.slice(-200)}`));
      }
      try {
        const last = stdout.split("\n").reverse().find((l) => l.trim().startsWith("{"));
        if (!last) return reject(new Error(`${scriptPath} no JSON: ${stdout.slice(-200)}`));
        const parsed = JSON.parse(last) as { framePattern: string; fps: number };
        resolve(parsed);
      } catch (err) {
        reject(new Error(`${scriptPath} bad JSON: ${err}`));
      }
    });
    child.on("error", reject);
    child.stdin.write(JSON.stringify(cfg));
    child.stdin.end();
  });
}

/** Detect "comparison" moments in narration — places where two values
 *  appear in the same sentence with comparison phrasing ("from X to Y",
 *  "X versus Y", "X grew to Y"). Returns at most one bar chart per
 *  insight so it doesn't dominate the visual mix. */
type BarMoment = {
  lineIdx: number;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
};

const COMPARISON_PATTERNS: { regex: RegExp; rightFirst?: boolean }[] = [
  { regex: /from\s+(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)\s+to\s+(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)/i },
  { regex: /(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)\s+(?:vs|versus|compared to)\s+(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)/i },
  { regex: /(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)\s+(?:grew to|became|reached|jumped to)\s+(\$?\d+(?:[.,]\d+)?\s*(?:T|B|M|K|Cr|trillion|billion|million|thousand|crore|lakh|%)?)/i },
];

export function detectBarMoments(scriptLines: { text: string }[]): BarMoment[] {
  const out: BarMoment[] = [];
  for (let i = 0; i < scriptLines.length; i++) {
    const text = scriptLines[i].text;
    for (const p of COMPARISON_PATTERNS) {
      const m = text.match(p.regex);
      if (!m) continue;
      const before = m[1].trim();
      const after = m[2].trim();
      // Use simple heuristic labels — "Before" vs "After" / "Then" vs "Now"
      const isFromTo = /from\s+/i.test(text.slice(0, m.index! + 6));
      const leftLabel = isFromTo ? "BEFORE" : "ONE";
      const rightLabel = isFromTo ? "AFTER" : "THE OTHER";
      out.push({
        lineIdx: i,
        leftLabel,
        leftValue: before,
        rightLabel,
        rightValue: after,
      });
      break; // one match per line
    }
    if (out.length >= 1) break; // one bar chart per explainer max
  }
  return out;
}

/**
 * Detect "stat moments" in narration script lines — places where a real
 * vlogger would pop up an animated number/stat callout to make the data
 * pop. Naive regex for now (numbers, currency, percentages, durations).
 *
 * Returns one stat per script line at most, since the overlay reads as
 * "this number matters" — multiple stacked feel cluttered. Limited to
 * the first 3 hits per explainer to avoid graphic overload.
 */
type StatMoment = {
  /** Index into scriptLines */
  lineIdx: number;
  /** Big value to show (e.g. "111", "$1.2T", "20 Cr") */
  value: string;
  /** Small contextual label below */
  label: string;
};

const NUMBER_RE =
  /(\$\s?\d+(?:[.,]\d+)?\s?(?:T|B|M|K)?|₹\s?\d+(?:[.,]\d+)?\s?(?:Cr|L|K|M|B)?|\d+(?:[.,]\d+)?\s?(?:percent|%)|\d{1,3}(?:,\d{3})+|\d+\s+(?:year|month|day|hour|minute|second)s?|\d+(?:[.,]\d+)?\s?(?:billion|million|thousand|crore|lakh)|\d{2,})/i;

export function detectStatMoments(
  scriptLines: { text: string }[],
  maxStats: number = 3,
): StatMoment[] {
  const out: StatMoment[] = [];
  for (let i = 0; i < scriptLines.length; i++) {
    const m = scriptLines[i].text.match(NUMBER_RE);
    if (!m) continue;
    const value = m[0].replace(/\s+/g, " ").trim();
    // Skip trivial numbers ("1 thing", "2 hours" can sometimes look weird
    // as a giant stat — only keep meaningful magnitudes).
    if (/^\d{1,2}$/.test(value)) continue;
    // Label = the noun phrase right after the number, naive (3 words max)
    const after = scriptLines[i].text.slice(m.index! + m[0].length).trim();
    const labelWords = after
      .replace(/[^a-zA-Z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
      .slice(0, 3);
    const label = labelWords.length > 0 ? labelWords.join(" ") : "KEY STAT";
    out.push({ lineIdx: i, value, label });
    if (out.length >= maxStats) break;
  }
  return out;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this",
  "his", "her", "their", "they", "them", "you", "your",
]);

/**
 * Render the full set of overlays for one explainer:
 *   - 1 title card at the start (1.5s)
 *   - up to N stat callouts at moments where numbers appear in narration
 *   - 1 pull quote on the punchiest line (highest-punch sentence)
 */
export async function renderInsightOverlays(args: {
  insightTitle: string;
  insightIdx: number;
  insightCount: number;
  scriptLines: { text: string }[];
  /** Per-line cumulative narration timestamps [{start, end}, ...] in
   *  the FINAL composed video. Used to time stat/pullquote overlays. */
  lineTimestamps: { start: number; end: number }[];
  /** Where to write the PNGs — typically workDir/explainer-N/graphics. */
  outDir: string;
}): Promise<CustomOverlay[]> {
  await mkdir(args.outDir, { recursive: true });
  const overlays: CustomOverlay[] = [];

  // 1) Title card — always present, 0..1.8s with 0.3s fades
  try {
    const titlePath = path.join(args.outDir, "title.png");
    await spawnRender({
      type: "title",
      title: args.insightTitle,
      subtitle: `INSIGHT ${args.insightIdx} OF ${args.insightCount}`,
      outPath: titlePath,
    });
    overlays.push({
      pngPath: titlePath,
      startSec: 0,
      endSec: 1.8,
      fadeSec: 0.3,
    });
  } catch (err) {
    console.warn(`[explainer-graphics] title render failed: ${err}`);
  }

  // 2) Stat callouts — pop up DURING the narration line that mentions
  //    them, with a real count-up animation (0 → target with overshoot
  //    bounce). Pre-renders a per-stat PNG sequence; composer plays it
  //    back at native fps so the number ANIMATES instead of just fading.
  const stats = detectStatMoments(args.scriptLines, 3);
  for (let si = 0; si < stats.length; si++) {
    const s = stats[si];
    const ts = args.lineTimestamps[s.lineIdx];
    if (!ts) continue;
    try {
      const statDir = path.join(args.outDir, `stat-${si}`);
      const overlayDur = (ts.end - ts.start) + 0.5;
      const meta = await spawnAnimatedStat({
        value: s.value,
        label: s.label,
        outDir: statDir,
        fps: 30,
        durationSec: overlayDur,
      });
      overlays.push({
        framePattern: meta.framePattern,
        fps: meta.fps,
        startSec: ts.start,
        endSec: ts.end + 0.5,
        fadeSec: 0.2,
      });
    } catch (err) {
      console.warn(`[explainer-graphics] stat render failed: ${err}`);
    }
  }

  // 3) Comparison bar chart — at most one per explainer, on the line
  //    that has a "from X to Y" / "X vs Y" pattern. The chart fills its
  //    bars sequentially (left then right) so the viewer reads it as
  //    a reveal, not a snapshot.
  const bars = detectBarMoments(args.scriptLines);
  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi];
    const ts = args.lineTimestamps[b.lineIdx];
    if (!ts) continue;
    try {
      const barDir = path.join(args.outDir, `bar-${bi}`);
      const overlayDur = (ts.end - ts.start) + 0.5;
      const meta = await spawnAnimatedBar({
        leftLabel: b.leftLabel,
        leftValue: b.leftValue,
        rightLabel: b.rightLabel,
        rightValue: b.rightValue,
        outDir: barDir,
        fps: 30,
        durationSec: overlayDur,
      });
      overlays.push({
        framePattern: meta.framePattern,
        fps: meta.fps,
        startSec: ts.start,
        endSec: ts.end + 0.5,
        fadeSec: 0.3,
      });
    } catch (err) {
      console.warn(`[explainer-graphics] bar render failed: ${err}`);
    }
  }

  // 4) Pull quote — find the punchiest line (longest non-question
  //    declarative as a heuristic) and render as a big centered quote
  //    over its narration window.
  const punchLine = pickPunchiestLine(args.scriptLines);
  if (punchLine && punchLine.lineIdx > 0) {
    const ts = args.lineTimestamps[punchLine.lineIdx];
    if (ts) {
      try {
        const quotePath = path.join(args.outDir, "pullquote.png");
        await spawnRender({
          type: "pullquote",
          text: punchLine.text,
          outPath: quotePath,
        });
        overlays.push({
          pngPath: quotePath,
          startSec: ts.start,
          endSec: ts.end,
          fadeSec: 0.3,
        });
      } catch (err) {
        console.warn(`[explainer-graphics] pullquote render failed: ${err}`);
      }
    }
  }

  return overlays;
}

/** Heuristic: punchiest line = a declarative statement that's neither
 *  the opener (already covered by title card) nor the closer (end card),
 *  in the 8-20 word range, with strong words. Exported so the composer
 *  can mark THAT shot for a punch-in zoom on top of the variable Ken
 *  Burns rotation. */
export function pickPunchiestLine(
  lines: { text: string }[],
): { lineIdx: number; text: string } | null {
  if (lines.length < 4) return null;
  const STRONG_WORDS = new Set([
    "never", "always", "wild", "insane", "shocking", "secret", "hidden",
    "actually", "real", "truth", "literally", "absolutely", "every", "no one",
    "nobody", "wrong", "right", "mistake", "won", "lost", "won't", "can't",
    "must", "exactly", "only", "first", "last", "biggest", "smallest", "most",
  ]);
  let best: { lineIdx: number; text: string; score: number } | null = null;
  for (let i = 1; i < lines.length - 1; i++) {
    const t = lines[i].text.trim();
    const wc = t.split(/\s+/).length;
    if (wc < 6 || wc > 22) continue;
    if (t.endsWith("?")) continue; // questions are weaker pull quotes
    let score = 0;
    const lower = t.toLowerCase();
    for (const w of STRONG_WORDS) if (lower.includes(w)) score += 2;
    score += Math.min(5, wc / 4);
    if (!best || score > best.score) best = { lineIdx: i, text: t, score };
  }
  return best ? { lineIdx: best.lineIdx, text: best.text } : null;
}
