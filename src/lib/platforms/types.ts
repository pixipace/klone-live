import type { SocialAccount } from "@prisma/client";

export type MediaType = "image" | "video" | null;

/** Extra context attached when the media being posted is a Klone clip
 *  (i.e. mediaUrl matches /api/uploads/clips/<jobId>/...). Currently only
 *  the YouTube poster reads this, to build a transformative-looking
 *  description (source attribution, commentary, transcript) that both
 *  improves Content ID dispute success AND signals fair-use. Optional —
 *  posters MUST tolerate this being undefined for non-clip uploads. */
export type ClipContext = {
  sourceUrl: string | null;
  sourceTitle: string | null;
  hookTitle: string | null;
  hookReason: string | null;
  transcript: string | null;
};

export type PlatformPostInput = {
  account: SocialAccount;
  caption: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  clipContext?: ClipContext;
};

export type PlatformSuccess = {
  success: true;
  id: string;
  url?: string;
  message: string;
};

export type PlatformError = {
  error: string;
  pendingApproval?: boolean;
};

export type PlatformResult = PlatformSuccess | PlatformError;

export function parseMeta<T = Record<string, unknown>>(
  account: SocialAccount
): T {
  if (!account.meta) return {} as T;
  try {
    return JSON.parse(account.meta) as T;
  } catch {
    return {} as T;
  }
}

export async function readUploadBuffer(mediaUrl: string): Promise<Buffer> {
  const { readFile } = await import("fs/promises");
  const path = await import("path");
  const filename = mediaUrl.replace("/api/uploads/", "");
  const filePath = path.join(process.cwd(), ".uploads", filename);
  return readFile(filePath);
}

export function publicMediaUrl(mediaUrl: string): string {
  return `${process.env.NEXTAUTH_URL}${mediaUrl}`;
}
