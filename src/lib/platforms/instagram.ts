import {
  type PlatformPostInput,
  type PlatformResult,
  parseMeta,
  publicMediaUrl,
} from "./types";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/token-crypto";

type IgMeta = {
  selectedInstagramId?: string;
  accounts?: Array<{
    instagramId: string;
    pageId: string;
    username: string;
    avatar?: string;
    followers?: number;
  }>;
};

type FbMeta = {
  pages?: Array<{ id: string; access_token: string }>;
};

export async function postToInstagram({
  account,
  caption,
  mediaUrl,
  mediaType,
}: PlatformPostInput): Promise<PlatformResult> {
  if (!mediaUrl) {
    return { error: "Instagram requires a photo or video to post" };
  }

  const meta = parseMeta<IgMeta>(account);
  const ig =
    (meta.selectedInstagramId
      ? meta.accounts?.find((a) => a.instagramId === meta.selectedInstagramId)
      : null) ?? meta.accounts?.[0];
  const instagramId = ig?.instagramId ?? account.externalId;
  const pageId = ig?.pageId;

  if (!instagramId) {
    return { error: "No Instagram Business account linked. Reconnect at /dashboard/accounts." };
  }
  if (!pageId) {
    return {
      error:
        "Instagram account has no linked Facebook Page. Connect a Page in Instagram → Settings → Account → Connected Accounts, then reconnect Klone.",
    };
  }

  // IG Graph API requires the PAGE access_token (NOT the user access_token).
  // The page token lives unencrypted inside the FB account's meta JSON
  // because Meta returns it that way at OAuth time. The user-level
  // accessToken on this Instagram row is AES-GCM encrypted and would
  // fail with "Cannot parse access token" if we used it directly.
  const fbAccount = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: account.userId, platform: "facebook" } },
  });
  if (!fbAccount) {
    return {
      error: "Connect Facebook in /dashboard/accounts — Instagram posting needs the linked Page's token.",
    };
  }
  let fbMeta: FbMeta = {};
  try {
    fbMeta = fbAccount.meta ? JSON.parse(fbAccount.meta) : {};
  } catch {}
  const page = fbMeta.pages?.find((p) => p.id === pageId);
  if (!page?.access_token) {
    return {
      error: "Couldn't find the linked Page's access token — reconnect Facebook in /dashboard/accounts.",
    };
  }
  // Page token in meta is plaintext (Meta returns it that way), but defensively
  // decrypt in case of future schema change.
  const pageAccessToken = page.access_token.startsWith("v1:")
    ? decryptToken(page.access_token) ?? page.access_token
    : page.access_token;

  const url = publicMediaUrl(mediaUrl);

  // Helper: try one media_type variant. Throws on container error or
  // publish failure. Returns the publish ID + permalink on success.
  const tryUpload = async (
    mediaTypeVariant: "REELS" | "VIDEO" | null,
  ): Promise<{ id: string; permalink?: string }> => {
    const params = new URLSearchParams({ caption, access_token: pageAccessToken });
    if (mediaType === "video") {
      if (mediaTypeVariant) params.set("media_type", mediaTypeVariant);
      params.set("video_url", url);
    } else {
      params.set("image_url", url);
    }

    const containerRes = await fetch(
      `https://graph.facebook.com/v24.0/${instagramId}/media`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
    );
    const containerData = await containerRes.json();
    if (containerData.error) throw new Error(containerData.error.message);
    const containerId = containerData.id;

    // Poll container status to FINISHED. Surface the full status
    // string from Meta when ERROR/EXPIRED so the caller can decide
    // whether to fall back to a different media_type.
    if (mediaType === "video") {
      const MAX_WAIT_MS = 60_000;
      const POLL_MS = 3_000;
      const start = Date.now();
      let lastStatus = "IN_PROGRESS";
      let lastErrorBody = "";
      while (Date.now() - start < MAX_WAIT_MS) {
        const statusRes = await fetch(
          // status field returns a human-readable message;
          // status_code is one of IN_PROGRESS / FINISHED / ERROR / EXPIRED
          `https://graph.facebook.com/v24.0/${containerId}?fields=status_code,status&access_token=${pageAccessToken}`,
        );
        const statusData = await statusRes.json();
        lastStatus = statusData.status_code || "UNKNOWN";
        lastErrorBody = statusData.status || "";
        if (lastStatus === "FINISHED") break;
        if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
          throw new Error(`Container ${lastStatus}: ${lastErrorBody || "video processing failed"}`);
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (lastStatus !== "FINISHED") {
        throw new Error(
          `Container still ${lastStatus} after ${MAX_WAIT_MS / 1000}s. Try again from /dashboard/posts.`,
        );
      }
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v24.0/${instagramId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId, access_token: pageAccessToken }),
      },
    );
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(publishData.error.message);

    let permalink: string | undefined;
    try {
      const permalinkRes = await fetch(
        `https://graph.facebook.com/v24.0/${publishData.id}?fields=permalink&access_token=${pageAccessToken}`,
      );
      const permalinkData = await permalinkRes.json();
      permalink = permalinkData.permalink;
    } catch {
      // Permalink fetch is best-effort.
    }

    return { id: publishData.id, permalink };
  };

  try {
    // Retry-with-backoff for transient fetch failures.
    //
    // Meta's IG fetcher hits 2207077 ("upload fetch failure") even when
    // the URL works fine for curl/FB — typically a transient network
    // hiccup or fetch-queue overload on Meta's side. Two retries with
    // exponential backoff (5s, 15s) clears most of these.
    //
    // Format errors (2207076 etc) WON'T be retried — re-fetching the
    // same file will hit the same parser and fail identically.
    //
    // Note: media_type=VIDEO no longer exists in Meta's IG API as of
    // 2024 — REELS is the ONLY supported video type. Old fallback to
    // VIDEO returned "Invalid parameter" so it's been removed.
    const RETRYABLE_CODES = ["2207077", "2207050"];
    const RETRY_DELAYS_MS = [5_000, 15_000];

    let result;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        result = await tryUpload("REELS");
        if (attempt > 0) console.log(`[instagram] succeeded on retry ${attempt}`);
        break;
      } catch (err) {
        lastErr = err;
        const errStr = String(err);
        const isRetryable = RETRYABLE_CODES.some((c) => errStr.includes(c));
        if (!isRetryable || attempt === RETRY_DELAYS_MS.length) {
          throw err;
        }
        const wait = RETRY_DELAYS_MS[attempt];
        console.warn(`[instagram] transient error (${errStr.match(/2207\d+/)?.[0] || "?"}), retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    if (!result) throw lastErr;

    return {
      success: true,
      id: result.id,
      url: result.permalink,
      message: "Posted to Instagram as Reel",
    };
  } catch (err) {
    const errMsg = String(err);
    // ALWAYS log the raw Meta error so it lands in server.log for
    // debugging — used to be swallowed silently behind the generic
    // "must be Business profile" message which masked unrelated
    // failures (URL fetch issues, video format, file size, etc).
    console.error("[instagram] post failed:", errMsg);

    // Specific error mapping. Meta returns OAuthException for almost
    // EVERY error including unrelated ones like "media URL fetch
    // failed", so don't blanket-treat OAuthException as a permission
    // problem like the old code did.
    const lower = errMsg.toLowerCase();

    // 1. Account-setup issues (real "needs Business profile" path).
    //    Meta error code (#10) is "permission denied for this action."
    //    "(#100)" is "Invalid parameter" but the message body usually
    //    spells out the missing piece.
    if (
      lower.includes("not a business") ||
      lower.includes("requires a business") ||
      lower.includes("ig user") && lower.includes("permission") ||
      errMsg.includes("(#10)")
    ) {
      return {
        error:
          "Instagram denied this post — make sure your IG is a Business or Creator profile linked to a Facebook Page. Reconnect at /dashboard/accounts.",
      };
    }

    // 2. Media URL fetch failures (Meta couldn't download our signed URL).
    //    Common when tunnel is down or signed URL expired before Meta got to it.
    if (
      lower.includes("unable to fetch") ||
      lower.includes("media") && lower.includes("download") ||
      lower.includes("url") && lower.includes("not accessible")
    ) {
      return {
        error:
          "Instagram couldn't download the video file. Klone's signed URL may have expired before Meta processed it — try the post again in a moment.",
      };
    }

    // 3. Video format / size / duration issues.
    if (
      lower.includes("video") && (lower.includes("format") || lower.includes("codec") || lower.includes("duration"))
    ) {
      return {
        error: `Instagram rejected the video format: ${errMsg.slice(0, 200)}`,
      };
    }

    // 4. Container/publish race condition (Meta API needs time between
    //    container create and publish for video processing).
    if (
      lower.includes("media id") ||
      lower.includes("not ready") ||
      lower.includes("processing")
    ) {
      return {
        error:
          "Instagram is still processing the video. Wait 30 seconds and retry from the Posts page.",
      };
    }

    // Default — pass the raw Meta error through so the user sees
    // something specific instead of a wrong "Business profile" claim.
    return { error: `Instagram: ${errMsg.slice(0, 250)}` };
  }
}
