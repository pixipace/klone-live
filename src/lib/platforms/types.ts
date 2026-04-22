import type { SocialAccount } from "@prisma/client";

export type MediaType = "image" | "video" | null;

export type PlatformPostInput = {
  account: SocialAccount;
  caption: string;
  mediaUrl?: string;
  mediaType?: MediaType;
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
