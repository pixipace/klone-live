import {
  type ClipContext,
  type PlatformPostInput,
  type PlatformResult,
  readUploadBuffer,
} from "./types";

/**
 * Take the (often short, hashtag-y) caption and assemble a beefy YouTube
 * description that signals fair-use + transformative work to Content ID
 * disputers and to the YT algorithm. Helps in two ways: (1) when matches
 * happen, dispute success rate is materially higher when there's clear
 * source attribution + commentary; (2) longer descriptions improve search
 * recall and "depth" signals YT factors into recommendations.
 */
function buildYouTubeDescription(
  caption: string,
  clip: ClipContext | undefined,
): string {
  if (!clip) return caption;

  const lines: string[] = [];
  if (caption) lines.push(caption.trim());

  if (clip.hookReason) {
    lines.push("", "📺 In this clip:", clip.hookReason.trim());
  }

  if (clip.sourceTitle || clip.sourceUrl) {
    lines.push("", "🎙️ Source attribution:");
    if (clip.sourceTitle) lines.push(`Title: ${clip.sourceTitle.trim()}`);
    if (clip.sourceUrl) lines.push(`Watch the full original: ${clip.sourceUrl}`);
  }

  // Standard fair-use / transformative-purpose language. YouTube's dispute
  // form asks the user to articulate the basis — having it pre-baked in
  // the description reinforces consistency between description and dispute.
  lines.push(
    "",
    "This is a short highlight clip from a longer original work, edited with added commentary, captions, and visual changes for educational and commentary purposes under fair use.",
  );

  if (clip.transcript) {
    const trimmed = clip.transcript.trim().slice(0, 1500);
    lines.push("", "📝 Transcript:", `"${trimmed}${clip.transcript.length > 1500 ? "…" : ""}"`);
  }

  return lines.join("\n").slice(0, 4900); // YT description hard cap is 5000
}

/**
 * Pull hashtags out of caption + add evergreen Shorts/clip tags for
 * search recall. YT 'tags' is separate from in-description hashtags
 * and doesn't render to viewers, so we can stuff niche keywords here
 * without polluting the visible caption.
 */
function buildYouTubeTags(caption: string, clip: ClipContext | undefined): string[] {
  const tags = new Set<string>(["shorts", "highlights", "clip"]);
  for (const m of caption.matchAll(/#(\w{2,40})/g)) {
    tags.add(m[1].toLowerCase());
  }
  if (clip?.sourceTitle) {
    // Take the first 3-4 meaningful words of the source title as tags.
    const words = clip.sourceTitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 4);
    for (const w of words) tags.add(w);
  }
  // YT enforces a 500-char total cap on tags joined.
  const out: string[] = [];
  let used = 0;
  for (const t of tags) {
    if (used + t.length + 1 > 480) break;
    out.push(t);
    used += t.length + 1;
  }
  return out;
}

export async function postToYouTube({
  account,
  caption,
  mediaUrl,
  mediaType,
  clipContext,
}: PlatformPostInput): Promise<PlatformResult> {
  if (!mediaUrl || mediaType !== "video") {
    return { error: "YouTube requires a video file. Please upload an MP4." };
  }

  const videoBuffer = await readUploadBuffer(mediaUrl);

  const titleBase = caption.slice(0, 100) || "New Short";
  const title = titleBase.includes("#Shorts") ? titleBase : `${titleBase} #Shorts`;

  const description = buildYouTubeDescription(caption, clipContext);
  const tags = buildYouTubeTags(caption, clipContext);

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
        snippet: {
          title,
          description,
          tags,
          categoryId: "22",
        },
        status: {
          // We always request "public". Until the OAuth app is fully
          // verified by Google, YouTube silently quarantines uploads from
          // unverified apps as private (visible to the uploader, hidden
          // from public). Once verification completes, the same request
          // starts publishing publicly with no code change required.
          privacyStatus: process.env.YOUTUBE_PRIVACY_OVERRIDE || "public",
          selfDeclaredMadeForKids: false,
          embeddable: true,
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
    message:
      "Video uploaded to YouTube as Short (public — may show as private until OAuth verification completes)",
  };
}
