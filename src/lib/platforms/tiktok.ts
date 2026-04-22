import {
  type PlatformPostInput,
  type PlatformResult,
  readUploadBuffer,
} from "./types";

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

  const initResponse = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
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
      }),
    }
  );

  const initData = await initResponse.json();

  if (initData.error?.code && initData.error.code !== "ok") {
    return {
      error: `TikTok: ${initData.error.code} - ${initData.error.message}`,
    };
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

  if (!uploadResponse.ok) {
    return { error: `TikTok upload: ${uploadResponse.status}` };
  }

  return {
    success: true,
    id: initData.data?.publish_id ?? "pending",
    message: "Posted to TikTok (processing)",
  };
}
