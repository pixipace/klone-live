import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  "user.ban": { label: "User banned", color: "text-error" },
  "user.unban": { label: "User unbanned", color: "text-success" },
  "user.delete": { label: "User deleted", color: "text-error" },
  "user.setPlan": { label: "Plan changed", color: "text-accent" },
  "user.setFeatureFlags": { label: "Feature flags changed", color: "text-accent" },
  "user.setLimits": { label: "Limits changed", color: "text-accent" },
  "user.setNotes": { label: "Notes updated", color: "text-muted-foreground" },
  "user.impersonate.start": { label: "Started impersonating", color: "text-warning" },
  "user.impersonate.stop": { label: "Stopped impersonating", color: "text-warning" },
  "cache.clear": { label: "Cache cleared", color: "text-accent" },
  "worker.pause": { label: "Worker paused", color: "text-warning" },
  "worker.resume": { label: "Worker resumed", color: "text-success" },
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; target?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filterAction = sp.action ?? "";
  const filterTarget = sp.target ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const PAGE_SIZE = 50;

  const where = {
    ...(filterAction && { action: filterAction }),
    ...(filterTarget && { targetId: filterTarget }),
  };

  const [logs, total, distinctActions] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.groupBy({
      by: ["action"],
      _count: { action: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Append-only record of every admin action. {total.toLocaleString()}{" "}
          total entries.
        </p>
      </div>

      <form action="/control-room/audit" method="GET" className="flex gap-2 flex-wrap items-center">
        <select
          name="action"
          defaultValue={filterAction}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All actions</option>
          {distinctActions
            .sort((a, b) => b._count.action - a._count.action)
            .map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a._count.action})
              </option>
            ))}
        </select>
        <input
          name="target"
          defaultValue={filterTarget}
          placeholder="Target ID (user id, cache key…)"
          className="flex-1 min-w-[240px] bg-background border border-border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="text-xs px-4 py-2 rounded-lg bg-card border border-border hover:border-accent/30 transition-colors"
        >
          Filter
        </button>
        {(filterAction || filterTarget) && (
          <a href="/control-room/audit" className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </a>
        )}
      </form>

      <div className="rounded-xl bg-card/60 border border-border/40 overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No audit entries match these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-card/80 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-4 py-2 font-medium">Admin</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Target</th>
                <th className="text-left px-4 py-2 font-medium">Details</th>
                <th className="text-left px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logs.map((l) => {
                const meta = ACTION_LABELS[l.action] ?? {
                  label: l.action,
                  color: "text-foreground",
                };
                return (
                  <tr key={l.id} className="hover:bg-card/40">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(l.createdAt, { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-xs">{l.adminEmail}</td>
                    <td className={`px-4 py-3 text-xs font-medium ${meta.color}`}>
                      {meta.label}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {l.targetId ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground max-w-md truncate">
                      {l.details ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted">
                      {l.ip ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/control-room/audit?${new URLSearchParams({
                  ...(filterAction && { action: filterAction }),
                  ...(filterTarget && { target: filterTarget }),
                  page: String(page - 1),
                }).toString()}`}
                className="px-3 py-1.5 rounded-lg bg-card border border-border hover:border-accent/30"
              >
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/control-room/audit?${new URLSearchParams({
                  ...(filterAction && { action: filterAction }),
                  ...(filterTarget && { target: filterTarget }),
                  page: String(page + 1),
                }).toString()}`}
                className="px-3 py-1.5 rounded-lg bg-card border border-border hover:border-accent/30"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
