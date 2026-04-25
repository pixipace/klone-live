import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAYS_BACK = 14;

export default async function AdminActivityPage() {
  const since = new Date(Date.now() - DAYS_BACK * 86400 * 1000);

  const [posts, clipJobs, signups] = await Promise.all([
    prisma.post.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    }),
    prisma.clipJob.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  // Bucket by date (YYYY-MM-DD in local time)
  type DayBucket = { date: string; posts: number; clips: number; signups: number };
  const buckets: Record<string, DayBucket> = {};
  for (let i = DAYS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const key = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
    buckets[key] = { date: key, posts: 0, clips: 0, signups: 0 };
  }

  for (const p of posts) {
    const k = p.createdAt.toLocaleDateString("en-CA");
    if (buckets[k]) buckets[k].posts += 1;
  }
  for (const j of clipJobs) {
    const k = j.createdAt.toLocaleDateString("en-CA");
    if (buckets[k]) buckets[k].clips += 1;
  }
  for (const u of signups) {
    const k = u.createdAt.toLocaleDateString("en-CA");
    if (buckets[k]) buckets[k].signups += 1;
  }

  const days = Object.values(buckets);
  const maxBar = Math.max(
    1,
    ...days.flatMap((d) => [d.posts, d.clips, d.signups])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last {DAYS_BACK} days, bucketed by day.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Signups</th>
              <th className="px-4 py-3 font-medium">Posts</th>
              <th className="px-4 py-3 font-medium">Clip jobs</th>
              <th className="px-4 py-3 font-medium w-1/2">Activity</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-border/40">
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {d.date}
                </td>
                <td className="px-4 py-2 text-sm">{d.signups}</td>
                <td className="px-4 py-2 text-sm">{d.posts}</td>
                <td className="px-4 py-2 text-sm">{d.clips}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 h-4 items-center">
                    <Bar value={d.signups} max={maxBar} color="bg-success" />
                    <Bar value={d.posts} max={maxBar} color="bg-accent" />
                    <Bar value={d.clips} max={maxBar} color="bg-warning" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <Legend color="bg-success" label="Signups" />
        <Legend color="bg-accent" label="Posts" />
        <Legend color="bg-warning" label="Clip jobs" />
      </div>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  if (value === 0) return null;
  const widthPx = Math.max(4, Math.round((value / max) * 200));
  return (
    <div
      className={`${color} rounded h-3`}
      style={{ width: `${widthPx}px` }}
      title={String(value)}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded ${color}`} />
      {label}
    </div>
  );
}
