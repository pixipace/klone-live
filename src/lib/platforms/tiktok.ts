import {
  type PlatformPostInput,
  type PlatformResult,
  readUploadBuffer,
} from "./types";

const DIRECT_POST_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const INBOX_UPLOAD_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";

export async function postToTikTok({
  account,
  caption,
  mediaUrl,
  mediaType,
}: PlatformPostInput): Promise<PlatformResult> {
  if (!mediaUrl || mediaType !== "video") {
    return { error: "TikTok requires a video file. Please upload an MP4." };
  }

  const videoBuffer = await readUploadBuffer(mediaUrl);
  const videoSize = videoBuffer.byteLength;

  // Try DIRECT POST first (publishes immediately to public feed). This
  // works for audited apps OR for users with private TikTok accounts.
  // If TikTok rejects with unaudited_client_can_only_post_to_private_accounts
  // (or similar sandbox-mode errors), fall back to INBOX upload — saves
  // the video as a draft in the user's TikTok inbox so they can publish
  // it manually with one tap. Slightly worse UX but unblocks unaudited
  // apps from posting at all.
  const directResult = await uploadToTikTok({
    initUrl: DIRECT_POST_URL,
    accessToken: account.accessToken,
    body: {
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    videoBuffer,
    videoSize,
    successMessage: "Posted to TikTok (processing)",
  });

  // Sandbox-mode error codes — fall back to inbox.
  const isSandboxError =
    "error" in directResult &&
    /unaudited_client|spam_risk_too_many_posts|app_unauthorized/i.test(directResult.error);
  if (!isSandboxError) return directResult;

  console.log("[tiktok] direct-post blocked (sandbox/unaudited), falling back to inbox");
  return uploadToTikTok({
    initUrl: INBOX_UPLOAD_URL,
    accessToken: account.accessToken,
    body: {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    videoBuffer,
    videoSize,
    successMessage: "Saved to TikTok inbox — open the TikTok app to publish",
  });
}

async function uploadToTikTok({
  initUrl,
  accessToken,
  body,
  videoBuffer,
  videoSize,
  successMessage,
}: {
  initUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
  videoBuffer: Buffer;
  videoSize: number;
  successMessage: string;
}): Promise<PlatformResult> {
  const initResponse = await fetch(initUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  const initData = await initResponse.json();
  if (initData.error?.code && initData.error.code !== "ok") {
    return { error: `TikTok: ${initData.error.code} - ${initData.error.message}` };
  }

  const uploadUrl = initData.data?.upload_url;
  if (!uploadUrl) return { error: "No upload URL from TikTok" };

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Length": String(videoSize),
    },
    body: new Uint8Array(videoBuffer),
  });
  if (!uploadResponse.ok) return { error: `TikTok upload: ${uploadResponse.status}` };

  return {
    success: true,
    id: initData.data?.publish_id ?? "pending",
    message: successMessage,
  };
}
