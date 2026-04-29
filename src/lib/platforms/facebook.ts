import {
  type PlatformPostInput,
  type PlatformResult,
  parseMeta,
  publicMediaUrl,
} from "./types";

type FacebookMeta = {
  pages?: Array<{ id: string; access_token: string; name: string }>;
  selectedPageId?: string;
};

export async function postToFacebook({
  account,
  caption,
  mediaUrl,
  mediaType,
}: PlatformPostInput): Promise<PlatformResult> {
  const meta = parseMeta<FacebookMeta>(account);
  const pages = meta.pages ?? [];
  const page = meta.selectedPageId
    ? pages.find((p) => p.id === meta.selectedPageId)
    : pages[0];

  if (!page) return { error: "No Facebook Page found for this user" };

  const pageAccessToken = page.access_token;
  const pageId = page.id;

  if (!mediaUrl) {
    const res = await fetch(`https://graph.facebook.com/v24.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: caption,
        access_token: pageAccessToken,
      }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error.message };
    return {
      success: true,
      id: data.id,
      url: `https://www.facebook.com/${data.id}`,
      message: "Posted to Facebook",
    };
  }

  const url = publicMediaUrl(mediaUrl);

  if (mediaType === "video") {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${pageId}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          file_url: url,
          description: caption,
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      const msg: string = data.error.message;
      // publish_video approved 2026-04-29 — code 200 / "permission" errors
      // post-approval mean the USER's specific page lacks Pages Manage Posts,
      // not the App lacking the scope. Surface as a connection issue.
      if (
        msg.toLowerCase().includes("permission") ||
        data.error.code === 200
      ) {
        return {
          error:
            "Facebook denied this video — your Page may have revoked posting permissions. Reconnect the account in /dashboard/accounts to re-grant.",
        };
      }
      return { error: msg };
    }
    return {
      success: true,
      id: data.id,
      url: `https://www.facebook.com/${pageId}/videos/${data.id}`,
      message: "Video posted to Facebook",
    };
  }

  const res = await fetch(`https://graph.facebook.com/v24.0/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      url,
      caption,
      access_token: pageAccessToken,
    }),
  });
  const data = await res.json();
  if (data.error) return { error: data.error.message };
  return {
    success: true,
    id: data.id,
    url: data.post_id
      ? `https://www.facebook.com/${data.post_id}`
      : `https://www.facebook.com/${pageId}`,
    message: "Photo posted to Facebook",
  };
}
