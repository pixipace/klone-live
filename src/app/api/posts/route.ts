import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caption, mediaUrl, mediaType, platforms } = body;

    const results: Record<string, unknown> = {};

    // TikTok
    if (platforms.includes("tiktok")) {
      const cookie = request.cookies.get("tiktok_account")?.value;
      if (!cookie) {
        results.tiktok = { error: "TikTok not connected" };
      } else if (!mediaUrl || mediaType !== "video") {
        results.tiktok = {
          error: "TikTok requires a video file. Please upload an MP4.",
        };
      } else {
        try {
          const account = JSON.parse(cookie);
          results.tiktok = await postToTikTok(
            account.accessToken,
            caption,
            mediaUrl
          );
        } catch (err) {
          console.error("TikTok post error:", err);
          results.tiktok = { error: String(err) };
        }
      }
    }

    // Facebook Page
    if (platforms.includes("facebook")) {
      const cookie = request.cookies.get("facebook_account")?.value;
      if (!cookie) {
        results.facebook = { error: "Facebook not connected" };
      } else {
        try {
          const account = JSON.parse(cookie);
          results.facebook = await postToFacebook(
            account,
            caption,
            mediaUrl,
            mediaType
          );
        } catch (err) {
          console.error("Facebook post error:", err);
          results.facebook = { error: String(err) };
        }
      }
    }

    // Instagram
    if (platforms.includes("instagram")) {
      const cookie = request.cookies.get("instagram_account")?.value;
      if (!cookie) {
        results.instagram = { error: "Instagram not connected" };
      } else if (!mediaUrl) {
        results.instagram = {
          error: "Instagram requires a photo or video to post",
        };
      } else {
        try {
          const account = JSON.parse(cookie);
          results.instagram = await postToInstagram(
            account,
            caption,
            mediaUrl,
            mediaType
          );
        } catch (err) {
          console.error("Instagram post error:", err);
          const errMsg = String(err);
          if (
            errMsg.includes("permission") ||
            errMsg.includes("does not have") ||
            errMsg.includes("not available") ||
            errMsg.includes("OAuthException") ||
            errMsg.includes("(#10)")
          ) {
            results.instagram = {
              error:
                "Instagram content publishing permission is pending platform review. Post will be published once approved.",
            };
          } else {
            results.instagram = { error: errMsg };
          }
        }
      }
    }

    // LinkedIn
    if (platforms.includes("linkedin")) {
      const cookie = request.cookies.get("linkedin_account")?.value;
      if (!cookie) {
        results.linkedin = { error: "LinkedIn not connected" };
      } else {
        try {
          const account = JSON.parse(cookie);
          results.linkedin = await postToLinkedIn(
            account.accessToken,
            account.personUrn,
            caption,
            mediaUrl,
            mediaType
          );
        } catch (err) {
          console.error("LinkedIn post error:", err);
          results.linkedin = { error: String(err) };
        }
      }
    }

    // YouTube
    if (platforms.includes("youtube")) {
      const cookie = request.cookies.get("youtube_account")?.value;
      if (!cookie) {
        results.youtube = { error: "YouTube not connected" };
      } else if (!mediaUrl || mediaType !== "video") {
        results.youtube = {
          error: "YouTube requires a video file. Please upload an MP4.",
        };
      } else {
        try {
          const account = JSON.parse(cookie);
          results.youtube = await postToYouTube(
            account.accessToken,
            caption,
            mediaUrl
          );
        } catch (err) {
          console.error("YouTube post error:", err);
          results.youtube = { error: String(err) };
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Post creation error:", err);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}

// --- TikTok ---
async function postToTikTok(
  accessToken: string,
  caption: string,
  mediaUrl: string
) {
  const filename = mediaUrl.replace("/api/uploads/", "");
  const filePath = path.join(process.cwd(), ".uploads", filename);
  const videoBuffer = await readFile(filePath);
  const videoSize = videoBuffer.byteLength;

  const initResponse = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    throw new Error(
      `TikTok: ${initData.error.code} - ${initData.error.message}`
    );
  }

  const uploadUrl = initData.data?.upload_url;
  if (!uploadUrl) throw new Error("No upload URL from TikTok");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Length": String(videoSize),
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`TikTok upload: ${uploadResponse.status}`);
  }

  return {
    success: true,
    publishId: initData.data?.publish_id,
    message: "Posted to TikTok",
  };
}

// --- Facebook ---
async function postToFacebook(
  account: { accessToken: string; pages?: Array<{ id: string; access_token: string; name: string }> },
  caption: string,
  mediaUrl: string | undefined,
  mediaType: "image" | "video" | null
) {
  const page = account.pages?.[0];
  if (!page) throw new Error("No Facebook Page found for this user");

  const pageAccessToken = page.access_token;
  const pageId = page.id;

  if (!mediaUrl) {
    // Text post
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          message: caption,
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { success: true, id: data.id, message: "Posted to Facebook" };
  }

  const publicUrl = `${process.env.NEXTAUTH_URL}${mediaUrl}`;

  if (mediaType === "video") {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${pageId}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          file_url: publicUrl,
          description: caption,
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { success: true, id: data.id, message: "Video posted to Facebook" };
  } else {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${pageId}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          url: publicUrl,
          caption: caption,
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { success: true, id: data.id, message: "Photo posted to Facebook" };
  }
}

// --- Instagram ---
async function postToInstagram(
  account: { accessToken: string; instagramId?: string },
  caption: string,
  mediaUrl: string,
  mediaType: "image" | "video" | null
) {
  const { accessToken, instagramId } = account;
  if (!instagramId) {
    throw new Error("No Instagram Business account linked");
  }

  const publicUrl = `${process.env.NEXTAUTH_URL}${mediaUrl}`;

  // Step 1: Create media container
  const containerParams = new URLSearchParams({
    caption,
    access_token: accessToken,
  });

  if (mediaType === "video") {
    containerParams.set("media_type", "REELS");
    containerParams.set("video_url", publicUrl);
  } else {
    containerParams.set("image_url", publicUrl);
  }

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

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v24.0/${instagramId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(publishData.error.message);

  return {
    success: true,
    id: publishData.id,
    message: "Posted to Instagram",
  };
}

// --- YouTube ---
async function postToYouTube(
  accessToken: string,
  caption: string,
  mediaUrl: string
) {
  const filename = mediaUrl.replace("/api/uploads/", "");
  const filePath = path.join(process.cwd(), ".uploads", filename);
  const videoBuffer = await readFile(filePath);

  // Use #Shorts in title to make it a YouTube Short (under 60s)
  const title = caption.slice(0, 100) || "New Short";
  const description = caption;

  // Step 1: Initialize resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: title.includes("#Shorts") ? title : `${title} #Shorts`,
          description,
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: "private", // Start as private for safety
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const errBody = await initRes.text();
    throw new Error(`YouTube init error: ${initRes.status} - ${errBody}`);
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from YouTube");
  }

  // Step 2: Upload the video
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`YouTube upload error: ${uploadRes.status} - ${errBody}`);
  }

  const uploadData = await uploadRes.json();

  return {
    success: true,
    id: uploadData.id,
    message: "Video uploaded to YouTube as Short",
  };
}

// --- LinkedIn ---
async function postToLinkedIn(
  accessToken: string,
  personUrn: string,
  caption: string,
  mediaUrl: string | undefined,
  mediaType: "image" | "video" | null
) {
  if (!personUrn) throw new Error("LinkedIn person URN not found");

  if (!mediaUrl) {
    // Text-only post
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: personUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
        },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`LinkedIn post error: ${res.status} - ${errBody}`);
    }

    const postId = res.headers.get("x-restli-id") || "posted";
    return { success: true, id: postId, message: "Posted to LinkedIn" };
  }

  // Media post (image or video)
  const isVideo = mediaType === "video";

  // Step 1: Initialize upload
  const initRes = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: personUrn,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const errBody = await initRes.text();
    throw new Error(`LinkedIn upload init: ${initRes.status} - ${errBody}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn upload initialization failed");
  }

  // Step 2: Upload the file
  const filename = mediaUrl.replace("/api/uploads/", "");
  const filePath = path.join(process.cwd(), ".uploads", filename);
  const fileBuffer = await readFile(filePath);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": isVideo ? "video/mp4" : "image/jpeg",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`LinkedIn upload: ${uploadRes.status} - ${errBody}`);
  }

  // Step 3: Create post with media
  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: personUrn,
      commentary: caption,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
      },
      content: {
        media: {
          id: imageUrn,
        },
      },
      lifecycleState: "PUBLISHED",
    }),
  });

  if (!postRes.ok) {
    const errBody = await postRes.text();
    throw new Error(`LinkedIn post: ${postRes.status} - ${errBody}`);
  }

  const postId = postRes.headers.get("x-restli-id") || "posted";
  return { success: true, id: postId, message: "Posted to LinkedIn" };
}
