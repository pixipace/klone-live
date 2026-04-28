import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/api-rate-limit";
import { ALL_PLATFORMS, type PlatformId } from "@/lib/platforms";

const PLATFORM_SET = new Set<string>(ALL_PLATFORMS);

// GET is read-only — skip rate limit (user-info reads don't need throttling)
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      clipperAutoPublish: true,
      clipperPlatforms: true,
      clipperClipsPerDay: true,
      clipperSkipWeekends: true,
      clipperWithAiHashtags: true,
      clipperTimezone: true,
      clipperCaptionStyle: true,
      clipperEndCardText: true,
      clipperDefaultHashtags: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    autoPublish: user.clipperAutoPublish,
    platforms: user.clipperPlatforms
      ? user.clipperPlatforms.split(",").filter((p) => PLATFORM_SET.has(p))
      : [],
    clipsPerDay: user.clipperClipsPerDay,
    skipWeekends: user.clipperSkipWeekends,
    withAiHashtags: user.clipperWithAiHashtags,
    timezone: user.clipperTimezone,
    captionStyle: user.clipperCaptionStyle || "bold",
    endCardText: user.clipperEndCardText || "",
    defaultHashtags: user.clipperDefaultHashtags || "",
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = enforceRateLimit(request, session.id, "user:clipper-prefs", 30);
  if (rl) return rl;
  const body = (await request.json()) as {
    autoPublish?: boolean;
    platforms?: string[];
    clipsPerDay?: number;
    skipWeekends?: boolean;
    withAiHashtags?: boolean;
    timezone?: string | null;
    captionStyle?: string;
    endCardText?: string | null;
    defaultHashtags?: string | null;
  };

  const data: {
    clipperAutoPublish?: boolean;
    clipperPlatforms?: string;
    clipperClipsPerDay?: number;
    clipperSkipWeekends?: boolean;
    clipperWithAiHashtags?: boolean;
    clipperTimezone?: string | null;
    clipperCaptionStyle?: string;
    clipperEndCardText?: string | null;
    clipperDefaultHashtags?: string | null;
  } = {};

  if (typeof body.autoPublish === "boolean") {
    data.clipperAutoPublish = body.autoPublish;
  }
  if (Array.isArray(body.platforms)) {
    const filtered = body.platforms.filter((p): p is PlatformId =>
      PLATFORM_SET.has(p)
    );
    data.clipperPlatforms = filtered.join(",");
  }
  if (typeof body.clipsPerDay === "number") {
    data.clipperClipsPerDay = Math.max(1, Math.min(10, Math.round(body.clipsPerDay)));
  }
  if (typeof body.skipWeekends === "boolean") {
    data.clipperSkipWeekends = body.skipWeekends;
  }
  if (typeof body.withAiHashtags === "boolean") {
    data.clipperWithAiHashtags = body.withAiHashtags;
  }
  if (body.timezone === null || typeof body.timezone === "string") {
    data.clipperTimezone = body.timezone;
  }
  if (typeof body.captionStyle === "string") {
    const style = body.captionStyle.toLowerCase();
    if (style === "classic" || style === "bold" || style === "yellow") {
      data.clipperCaptionStyle = style;
    }
  }
  if (body.endCardText === null || typeof body.endCardText === "string") {
    const t = body.endCardText?.trim() ?? "";
    data.clipperEndCardText = t.length > 0 ? t.slice(0, 60) : null;
  }
  if (body.defaultHashtags === null || typeof body.defaultHashtags === "string") {
    const cleaned = (body.defaultHashtags ?? "")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      // Normalize: ensure each starts with #, lowercase, drop non-tag chars
      .map((t) => {
        const withHash = t.startsWith("#") ? t : `#${t}`;
        return withHash.replace(/[^#\w]/g, "");
      })
      .filter((t) => t.length > 1)
      .slice(0, 30); // sanity cap — no one needs 30 default tags
    data.clipperDefaultHashtags = cleaned.length > 0 ? cleaned.join(" ") : null;
  }

  // Guard: if user enabled auto-publish, they must have at least one platform
  // selected. Otherwise the clip would render and silently never go anywhere.
  if (data.clipperAutoPublish === true) {
    const newPlatforms =
      data.clipperPlatforms ??
      (await prisma.user.findUnique({
        where: { id: session.id },
        select: { clipperPlatforms: true },
      }))?.clipperPlatforms ??
      "";
    if (!newPlatforms || newPlatforms.split(",").filter(Boolean).length === 0) {
      return NextResponse.json(
        {
          error:
            "Pick at least one platform before enabling auto-publish — otherwise rendered clips have nowhere to go.",
        },
        { status: 400 }
      );
    }
  }

  await prisma.user.update({
    where: { id: session.id },
    data,
  });

  return NextResponse.json({ ok: true });
}
