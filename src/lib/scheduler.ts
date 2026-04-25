import { prisma } from "@/lib/prisma";
import { firePost } from "@/lib/post-runner";
import { sendWeeklyDigests, isDigestSendWindow } from "@/lib/digest";

const POLL_INTERVAL_MS = 60_000;
const MAX_PARALLEL = 3;

let started = false;
let timer: NodeJS.Timeout | null = null;
let inflight = 0;
// One-shot guard so we don't try to send digests on every tick within the
// 2-hour Monday window — first successful run sets this until the next day.
let lastDigestRunDay: number | null = null;

async function tick() {
  // Weekly digest send (once on Monday 09-11 UTC)
  const now = new Date();
  const today = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  if (lastDigestRunDay !== today && isDigestSendWindow(now)) {
    lastDigestRunDay = today;
    sendWeeklyDigests()
      .then((n) => {
        if (n > 0) console.log(`[scheduler] sent ${n} weekly digest email(s)`);
      })
      .catch((err) =>
        console.error("[scheduler] weekly digest failed:", err)
      );
  }

  if (inflight >= MAX_PARALLEL) return;

  const due = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PARALLEL - inflight,
  });

  for (const post of due) {
    inflight += 1;
    prisma.post
      .update({
        where: { id: post.id },
        data: { status: "POSTING" },
      })
      .then(() => firePost(post))
      .catch((err) => {
        console.error(`[scheduler] firePost failed for ${post.id}:`, err);
        return prisma.post
          .update({
            where: { id: post.id },
            data: {
              status: "FAILED",
              results: JSON.stringify({ error: String(err) }),
            },
          })
          .catch(() => {});
      })
      .finally(() => {
        inflight -= 1;
      });
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  console.log(`[scheduler] starting, polling every ${POLL_INTERVAL_MS}ms`);
  timer = setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick error:", err));
  }, POLL_INTERVAL_MS);
  tick().catch((err) => console.error("[scheduler] initial tick error:", err));
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
