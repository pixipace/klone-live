import {
  type PlatformPostInput,
  type PlatformResult,
  parseMeta,
  publicMediaUrl,
} from "./types";

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
  const instagramId =
    meta.selectedInstagramId ?? account.externalId ?? meta.accounts?.[0]?.instagramId;

  if (!instagramId) {
    return { error: "No Instagram Business account linked" };
  }

  const url = publicMediaUrl(mediaUrl);

  const containerParams = new URLSearchParams({
    caption,
    access_token: account.accessToken,
  });

  if (mediaType === "video") {
    containerParams.set("media_type", "REELS");
    containerParams.set("video_url", url);
  } else {
    containerParams.set("image_url", url);
  }

  try {
    const containerRes = await fetch(
      `https://graph.facebook.com/v24.0/${instagramId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: containerParams,
      }
    );

    const containerData = await containerRes.json();
    if (containerData.error) throw new Error(containerData.error.message);

    const containerId = containerData.id;

    const publishRes = await fetch(
      `https://graph.facebook.com/v24.0/${instagramId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: account.accessToken,
        }),
      }
    );

    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(publishData.error.message);

    let permalink: string | undefined;
    try {
      const permalinkRes = await fetch(
        `https://graph.facebook.com/v24.0/${publishData.id}?fields=permalink&access_token=${account.accessToken}`
      );
      const permalinkData = await permalinkRes.json();
      permalink = permalinkData.permalink;
    } catch {
      // Permalink fetch is best-effort.
    }

    return {
      success: true,
      id: publishData.id,
      url: permalink,
      message: "Posted to Instagram",
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
