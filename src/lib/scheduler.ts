import { prisma } from "@/lib/prisma";
import { firePost } from "@/lib/post-runner";

const POLL_INTERVAL_MS = 60_000;
const MAX_PARALLEL = 3;

let started = false;
let timer: NodeJS.Timeout | null = null;
let inflight = 0;

async function tick() {
  if (inflight >= MAX_PARALLEL) return;

  const now = new Date();
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
