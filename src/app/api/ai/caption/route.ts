import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  generateCaption,
  generateCaptionVariants,
  rewriteForPlatform,
  suggestHashtags,
  isOllamaUp,
} from "@/lib/ai";

const PLATFORMS = ["tiktok", "facebook", "instagram", "linkedin", "youtube"] as const;
type Platform = (typeof PLATFORMS)[number];

function isPlatform(p: unknown): p is Platform {
  return typeof p === "string" && (PLATFORMS as readonly string[]).includes(p);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await isOllamaUp())) {
    return NextResponse.json(
      { error: "AI unavailable — Ollama not running" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { mode, topic, draft, platform, tone, withHashtags, variants } = body as {
    mode?: "generate" | "rewrite";
    topic?: string;
    draft?: string;
    platform?: string;
    tone?: string;
    withHashtags?: boolean;
    variants?: number;
  };

  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  try {
    if (mode === "generate" && variants && variants > 1) {
      if (!topic) {
        return NextResponse.json({ error: "Missing topic" }, { status: 400 });
      }
      const captions = await generateCaptionVariants(
        topic,
        platform,
        tone || "friendly",
        Math.min(variants, 5)
      );
      if (captions.length === 0) {
        return NextResponse.json(
          { error: "AI returned no usable variants — try again or rephrase the topic" },
          { status: 502 }
        );
      }
      return NextResponse.json({ captions });
    }

    let caption: string;
    if (mode === "rewrite") {
      if (!draft) {
        return NextResponse.json({ error: "Missing draft" }, { status: 400 });
      }
      caption = await rewriteForPlatform(draft, platform);
    } else {
      if (!topic) {
        return NextResponse.json({ error: "Missing topic" }, { status: 400 });
      }
      caption = await generateCaption(topic, platform, tone || "friendly");
    }

    const hashtags = withHashtags ? await suggestHashtags(caption, platform) : [];
    return NextResponse.json({ caption, hashtags });
  } catch (err) {
    console.error("AI caption error:", err);
    return NextResponse.json(
      { error: `AI failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
