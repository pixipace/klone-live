import { cookies } from "next/headers";
import { ExitImpersonationButton } from "./exit-impersonation-button";

/**
 * Server-rendered banner shown at the top of every dashboard page when
 * the current session is from an admin impersonation. Reads the
 * klone_imp_origin cookie set by /api/control-room/impersonate/[id].
 */
export async function ImpersonationBanner() {
  const c = await cookies();
  const adminEmail = c.get("klone_imp_origin")?.value;
  if (!adminEmail) return null;

  return (
    <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/25 shrink-0">
          Impersonating
        </span>
        <span className="truncate">
          You&apos;re viewing as another user. Acting as admin{" "}
          <strong>{adminEmail}</strong>.
        </span>
      </div>
      <ExitImpersonationButton />
    </div>
  );
}
