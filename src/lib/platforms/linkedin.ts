import {
  type PlatformPostInput,
  type PlatformResult,
  parseMeta,
  readUploadBuffer,
} from "./types";

type LinkedInMeta = { personUrn?: string };

const API_VERSION = "202504";

export async function postToLinkedIn({
  account,
  caption,
  mediaUrl,
  mediaType,
}: PlatformPostInput): Promise<PlatformResult> {
  const meta = parseMeta<LinkedInMeta>(account);
  const personUrn = meta.personUrn;
  if (!personUrn) return { error: "LinkedIn person URN not found" };

  if (!mediaUrl) {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: personUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED" },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { error: `LinkedIn post error: ${res.status} - ${errBody}` };
    }

    const postId = res.headers.get("x-restli-id") || "posted";
    return {
      success: true,
      id: postId,
      url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`,
      message: "Posted to LinkedIn",
    };
  }

  const isVideo = mediaType === "video";

  const initRes = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": API_VERSION,
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
    }
  );

  if (!initRes.ok) {
    const errBody = await initRes.text();
    return { error: `LinkedIn upload init: ${initRes.status} - ${errBody}` };
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    return { error: "LinkedIn upload initialization failed" };
  }

  const fileBuffer = await readUploadBuffer(mediaUrl);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": isVideo ? "video/mp4" : "image/jpeg",
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    return { error: `LinkedIn upload: ${uploadRes.status} - ${errBody}` };
  }

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: personUrn,
      commentary: caption,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      content: { media: { id: imageUrn } },
      lifecycleState: "PUBLISHED",
    }),
  });

  if (!postRes.ok) {
    const errBody = await postRes.text();
    return { error: `LinkedIn post: ${postRes.status} - ${errBody}` };
  }

  const postId = postRes.headers.get("x-restli-id") || "posted";
  return {
    success: true,
    id: postId,
    url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`,
    message: "Posted to LinkedIn",
  };
}
