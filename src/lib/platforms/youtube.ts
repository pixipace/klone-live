import {
  type PlatformPostInput,
  type PlatformResult,
  readUploadBuffer,
} from "./types";

export async function postToYouTube({
  account,
  caption,
  mediaUrl,
  mediaType,
}: PlatformPostInput): Promise<PlatformResult> {
  if (!mediaUrl || mediaType !== "video") {
    return { error: "YouTube requires a video file. Please upload an MP4." };
  }

  const videoBuffer = await readUploadBuffer(mediaUrl);

  const titleBase = caption.slice(0, 100) || "New Short";
  const title = titleBase.includes("#Shorts") ? titleBase : `${titleBase} #Shorts`;

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: { title, description: caption, categoryId: "22" },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const errBody = await initRes.text();
    return { error: `YouTube init error: ${initRes.status} - ${errBody}` };
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) return { error: "No upload URL returned from YouTube" };

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBuffer.byteLength),
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    return { error: `YouTube upload error: ${uploadRes.status} - ${errBody}` };
  }

  const uploadData = await uploadRes.json();

  return {
    success: true,
    id: uploadData.id,
    url: `https://youtube.com/shorts/${uploadData.id}`,
    message: "Video uploaded to YouTube as Short (private)",
  };
}
