import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: {
        select: { socialAccounts: true, posts: true, clipJobs: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {users.length} user{users.length === 1 ? "" : "s"} shown
          </p>
        </div>
        <form action="/control-room/users" method="get" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-64"
          />
        </form>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Connected</th>
              <th className="px-4 py-3 font-medium">Posts</th>
              <th className="px-4 py-3 font-medium">Clip jobs</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-border/40 hover:bg-card/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/control-room/users/${u.id}`}
                    className="flex items-center gap-3 hover:text-accent"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-semibold">
                      {(u.name || u.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {u.name || "(no name)"}
                        {u.role === "ADMIN" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-medium">
                            ADMIN
                          </span>
                        )}
                        {u.banned && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-medium">
                            BANNED
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs">{u.plan}</td>
                <td className="px-4 py-3 text-xs">{u._count.socialAccounts}</td>
                <td className="px-4 py-3 text-xs">{u._count.posts}</td>
                <td className="px-4 py-3 text-xs">{u._count.clipJobs}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.createdAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
