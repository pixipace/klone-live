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
    // instagram_content_publish approved 2026-04-29 — permission errors
    // post-approval mean the user's IG account is missing a Business
    // profile link or the Page<->IG connection lapsed. Tell them to
    // reconnect rather than wait for approval.
    if (
      errMsg.includes("permission") ||
      errMsg.includes("does not have") ||
      errMsg.includes("not available") ||
      errMsg.includes("OAuthException") ||
      errMsg.includes("(#10)")
    ) {
      return {
        error:
          "Instagram denied this post — your account must be a Business or Creator profile linked to a Facebook Page. Reconnect at /dashboard/accounts.",
      };
    }
    return { error: errMsg };
  }
}
