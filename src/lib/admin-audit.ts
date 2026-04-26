import { prisma } from "./prisma";
import { getClientIp } from "./rate-limit";

/**
 * Append-only audit log for admin actions taken from /control-room.
 * Every state-changing admin operation MUST call this so we have a
 * paper trail. Never throws — failure to log shouldn't block the action.
 */
export async function logAdminAction(opts: {
  adminEmail: string;
  action: string;
  targetId?: string | null;
  details?: Record<string, unknown> | string | null;
  request?: Request;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminEmail: opts.adminEmail,
        action: opts.action,
        targetId: opts.targetId ?? null,
        details:
          typeof opts.details === "string"
            ? opts.details
            : opts.details
              ? JSON.stringify(opts.details)
              : null,
        ip: opts.request ? getClientIp(opts.request) : null,
      },
    });
  } catch (err) {
    console.error("[admin-audit] log failed:", err);
  }
}
