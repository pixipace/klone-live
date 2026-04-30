"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PlatformId } from "@/lib/constants";
import {
  Image as ImageIcon,
  Video,
  Upload,
  Send,
  X,
  Eye,
  CheckCircle2,
  Loader2,
  Trash2,
  Sparkles,
  Hash,
  Wand2,
} from "lucide-react";

const platformIcons: Record<string, string> = {
  twitter: "\ud835\udd4f",
  tiktok: "\u266a",
  linkedin: "in",
  instagram: "\ud83d\udcf7",
  facebook: "f",
  youtube: "\u25b6",
};

export default function CreatePostPage() {
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [mediaName, setMediaName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("friendly");
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"generate" | "rewrite" | "hashtags" | "media" | "variants" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVariants, setAiVariants] = useState<string[] | null>(null);
  // Connected-platform gating — fetched once on mount. Platforms not in
  // this set get disabled in the picker (and the user is told to connect
  // them in /dashboard/accounts) instead of being clickable + silently
  // failing later when the post API rejects.
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<PlatformId> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const callAi = async (
    mode: "generate" | "rewrite" | "hashtags" | "media" | "variants",
    body: Record<string, unknown>,
    endpoint = "/api/ai/caption"
  ) => {
    setAiBusy(mode);
    setAiError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI failed");
      return data as { caption?: string; captions?: string[]; hashtags?: string[] };
    } catch (err) {
      setAiError(String(err instanceof Error ? err.message : err));
      return null;
    } finally {
      setAiBusy(null);
    }
  };

  const aiGenerateVariants = async () => {
    if (!aiTopic.trim() || selectedPlatforms.length === 0) return;
    setAiVariants(null);
    const data = await callAi("variants", {
      mode: "generate",
      topic: aiTopic,
      platform: selectedPlatforms[0],
      tone: aiTone,
      variants: 3,
    });
    if (data?.captions && data.captions.length > 0) {
      setAiVariants(data.captions);
    }
  };

  const pickVariant = (text: string) => {
    setCaption(text);
    setAiVariants(null);
  };

  const aiCaptionFromMedia = async () => {
    if (!mediaUrl || mediaType !== "image" || selectedPlatforms.length === 0) return;
    const data = await callAi(
      "media",
      {
        mediaUrl,
        mediaType,
        platform: selectedPlatforms[0],
        tone: aiTone,
        context: aiTopic.trim() || undefined,
      },
      "/api/ai/caption-from-media"
    );
    if (data?.caption) setCaption(data.caption);
  };

  const aiGenerate = async () => {
    if (!aiTopic.trim() || selectedPlatforms.length === 0) return;
    const data = await callAi("generate", {
      mode: "generate",
      topic: aiTopic,
      platform: selectedPlatforms[0],
      tone: aiTone,
      withHashtags: false,
    });
    if (data?.caption) setCaption(data.caption);
  };

  const aiRewrite = async () => {
    if (!caption.trim() || selectedPlatforms.length === 0) return;
    const data = await callAi("rewrite", {
      mode: "rewrite",
      draft: caption,
      platform: selectedPlatforms[0],
    });
    if (data?.caption) setCaption(data.caption);
  };

  const aiHashtags = async () => {
    if (!caption.trim() || selectedPlatforms.length === 0) return;
    const data = await callAi("hashtags", {
      mode: "rewrite",
      draft: caption,
      platform: selectedPlatforms[0],
      withHashtags: true,
    });
    if (data?.hashtags?.length) {
      setCaption((prev) => `${prev}\n\n${data.hashtags!.join(" ")}`);
    }
  };

  // Load connected platforms ONCE on mount. The picker uses this to
  // visually disable + lock platform buttons the user hasn't OAuth'd
  // yet — clicking does nothing and a tooltip explains how to connect.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts/connected")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const set = new Set<PlatformId>(Array.isArray(data.connected) ? data.connected : []);
        setConnectedPlatforms(set);
        // Defensively prune any pre-selected platforms that aren't connected
        // (could come from compose-prefill if the user disconnected mid-flow).
        setSelectedPlatforms((prev) => prev.filter((p) => set.has(p)));
      })
      .catch(() => {
        // On failure, fall back to "all platforms allowed" so the picker
        // still works — backend will return a clear error if they really
        // aren't connected. Better than blocking the whole UI on a
        // network blip.
        if (!cancelled) setConnectedPlatforms(new Set(["tiktok", "facebook", "instagram", "linkedin", "youtube"]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("klone:compose-prefill");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as {
        caption?: string;
        mediaUrl?: string;
        mediaType?: "image" | "video";
        mediaName?: string;
        ts?: number;
      };
      if (data.ts && Date.now() - data.ts > 5 * 60 * 1000) {
        sessionStorage.removeItem("klone:compose-prefill");
        return;
      }
      if (data.caption) setCaption(data.caption);
      if (data.mediaUrl) setMediaUrl(data.mediaUrl);
      if (data.mediaType) setMediaType(data.mediaType);
      if (data.mediaName) setMediaName(data.mediaName);
      setPrefillBanner("Loaded from Clip Studio — tweak the caption and pick platforms.");
      sessionStorage.removeItem("klone:compose-prefill");
    } catch {
      sessionStorage.removeItem("klone:compose-prefill");
    }
  }, []);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const charLimits: Record<string, number> = {
    twitter: 280,
    tiktok: 2200,
    linkedin: 3000,
    instagram: 2200,
    facebook: 63206,
    youtube: 5000,
  };

  const minCharLimit = selectedPlatforms.length
    ? Math.min(...selectedPlatforms.map((p) => charLimits[p]))
    : 280;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setPostResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setMediaUrl(data.url);
      setMediaName(file.name);
      setMediaType(file.type.startsWith("video/") ? "video" : "image");
    } catch (err) {
      console.error("Upload error:", err);
      setPostResult({
        success: false,
        message: `Upload failed: ${err}`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async () => {
    if (selectedPlatforms.length === 0) {
      setPostResult({
        success: false,
        message: "Please select at least one platform",
      });
      return;
    }

    if (!caption && !mediaUrl) {
      setPostResult({
        success: false,
        message: "Please add a caption or upload media",
      });
      return;
    }

    setPosting(true);
    setPostResult(null);

    let scheduledFor: string | null = null;
    if (scheduleDate && scheduleTime) {
      const local = new Date(`${scheduleDate}T${scheduleTime}`);
      if (!Number.isNaN(local.getTime()) && local.getTime() > Date.now()) {
        scheduledFor = local.toISOString();
      }
    }

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          mediaUrl,
          mediaType,
          platforms: selectedPlatforms,
          scheduledFor,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.scheduled) {
        const when = new Date(data.scheduledFor).toLocaleString();
        setPostResult({
          success: true,
          message: `Scheduled for ${when}. Will post automatically.`,
        });
        setCaption("");
        setMediaUrl(null);
        setMediaType(null);
        setMediaName("");
        setSelectedPlatforms([]);
        setScheduleDate("");
        setScheduleTime("");
        setPosting(false);
        return;
      }

      const succeeded: string[] = [];
      const pending: string[] = [];
      const failed: string[] = [];

      for (const [platform, result] of Object.entries(data.results || {})) {
        const r = result as { error?: string; success?: boolean };
        if (r.success) {
          succeeded.push(platform);
        } else if (
          r.error?.includes("permission") ||
          r.error?.includes("scope") ||
          r.error?.includes("review") ||
          r.error?.includes("not available") ||
          r.error?.includes("does not have")
        ) {
          pending.push(platform);
        } else {
          failed.push(platform);
        }
      }

      if (succeeded.length > 0 && failed.length === 0 && pending.length === 0) {
        setPostResult({
          success: true,
          message: `Published to ${succeeded.join(", ")} successfully!`,
        });
        setCaption("");
        setMediaUrl(null);
        setMediaType(null);
        setMediaName("");
        setSelectedPlatforms([]);
      } else if (succeeded.length > 0) {
        const msgs: string[] = [
          `Published to ${succeeded.join(", ")}.`,
        ];
        if (pending.length > 0) {
          msgs.push(
            `${pending.join(", ")}: pending platform approval.`
          );
        }
        if (failed.length > 0) {
          msgs.push(`${failed.join(", ")}: posting failed.`);
        }
        setPostResult({ success: true, message: msgs.join(" ") });
        setCaption("");
        setMediaUrl(null);
        setMediaType(null);
        setMediaName("");
        setSelectedPlatforms([]);
      } else if (pending.length > 0 && failed.length === 0) {
        setPostResult({
          success: false,
          message: `Post submitted. ${pending.join(", ")}: awaiting platform API approval. Your post will be published once approved.`,
        });
      } else {
        const msgs: string[] = [];
        if (pending.length > 0)
          msgs.push(
            `${pending.join(", ")}: awaiting platform API approval.`
          );
        if (failed.length > 0) {
          for (const p of failed) {
            const r = data.results[p] as { error?: string };
            msgs.push(
              `${p}: ${r.error || "posting failed."}`
            );
          }
        }
        setPostResult({
          success: false,
          message: msgs.join(" "),
        });
      }
    } catch (err) {
      setPostResult({
        success: false,
        message: `Post failed: ${err}`,
      });
    } finally {
      setPosting(false);
    }
  };

  const removeMedia = () => {
    setMediaUrl(null);
    setMediaType(null);
    setMediaName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 lg:pb-0">
      {/* Result Banner */}
      {prefillBanner && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {prefillBanner}
        </div>
      )}

      {postResult && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            postResult.success
              ? "bg-success/10 border border-success/20 text-success"
              : "bg-error/10 border border-error/20 text-error"
          }`}
        >
          {postResult.success ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {postResult.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Compose */}
        <div className="lg:col-span-2 space-y-4">
          {/* Platform Selector — gated by /api/accounts/connected. Platforms
              the user hasn't OAuth'd are visibly disabled with a helper
              link to /dashboard/accounts so they can connect first.
              Prevents the silent "post failed because account missing"
              footgun. */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-base">Select platforms</CardTitle>
              {connectedPlatforms !== null && connectedPlatforms.size === 0 && (
                <Link href="/dashboard/accounts" className="text-xs text-accent hover:underline">
                  Connect accounts →
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => {
                const isSelected = selectedPlatforms.includes(platform.id);
                // null = still loading prefs; treat as enabled to avoid flash.
                const isConnected =
                  connectedPlatforms === null || connectedPlatforms.has(platform.id);
                return (
                  <button
                    key={platform.id}
                    onClick={() => isConnected && togglePlatform(platform.id)}
                    disabled={!isConnected}
                    title={
                      isConnected
                        ? undefined
                        : `Connect ${platform.name} in /dashboard/accounts to post here`
                    }
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all ${
                      !isConnected
                        ? "border-border bg-card/50 text-muted opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-foreground bg-foreground/5 text-foreground"
                        : "border-border bg-card text-foreground-secondary hover:border-border-hover"
                    }`}
                  >
                    <span className="text-base">{platformIcons[platform.id]}</span>
                    {platform.name}
                    {!isConnected && (
                      <span className="text-[10px] text-muted ml-1">not connected</span>
                    )}
                    {isConnected && isSelected && <X className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
            {connectedPlatforms !== null && connectedPlatforms.size === 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                You haven't connected any platforms yet.{" "}
                <Link href="/dashboard/accounts" className="text-accent hover:underline">
                  Connect at least one
                </Link>{" "}
                to start posting.
              </p>
            )}
          </Card>

          {/* Caption */}
          <Card>
            <CardTitle className="mb-3 text-base">Caption</CardTitle>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your post caption..."
              rows={6}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-2">
                {selectedPlatforms.map((p) => {
                  const limit = charLimits[p];
                  const over = caption.length > limit;
                  return (
                    <span
                      key={p}
                      className={`text-xs ${
                        over ? "text-error" : "text-muted"
                      }`}
                    >
                      {platformIcons[p]} {caption.length}/{limit}
                    </span>
                  );
                })}
              </div>
              <span
                className={`text-xs ${
                  caption.length > minCharLimit ? "text-error" : "text-muted"
                }`}
              >
                {caption.length} characters
              </span>
            </div>
          </Card>

          {/* AI Assist */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                AI Assist
              </CardTitle>
              <span className="text-[11px] text-muted">Powered by Gemma (local)</span>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Topic — e.g. launching our new pricing"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="bold">Bold</option>
                  <option value="witty">Witty</option>
                  <option value="inspirational">Inspirational</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={aiGenerate}
                  disabled={
                    aiBusy !== null ||
                    !aiTopic.trim() ||
                    selectedPlatforms.length === 0
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiBusy === "generate" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Generate
                </button>
                <button
                  type="button"
                  onClick={aiGenerateVariants}
                  disabled={
                    aiBusy !== null ||
                    !aiTopic.trim() ||
                    selectedPlatforms.length === 0
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium rounded-lg border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiBusy === "variants" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  3 angles
                </button>
                <button
                  type="button"
                  onClick={aiRewrite}
                  disabled={
                    aiBusy !== null ||
                    !caption.trim() ||
                    selectedPlatforms.length === 0
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium rounded-lg border border-border bg-card text-foreground hover:border-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiBusy === "rewrite" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Rewrite for {selectedPlatforms[0] || "platform"}
                </button>
                <button
                  type="button"
                  onClick={aiHashtags}
                  disabled={
                    aiBusy !== null ||
                    !caption.trim() ||
                    selectedPlatforms.length === 0
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium rounded-lg border border-border bg-card text-foreground hover:border-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiBusy === "hashtags" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Hash className="w-3.5 h-3.5" />
                  )}
                  Add hashtags
                </button>
                <button
                  type="button"
                  onClick={aiCaptionFromMedia}
                  disabled={
                    aiBusy !== null ||
                    !mediaUrl ||
                    mediaType !== "image" ||
                    selectedPlatforms.length === 0
                  }
                  title={
                    mediaType === "video"
                      ? "Video captioning coming soon — uses Whisper for audio"
                      : !mediaUrl
                        ? "Upload an image first"
                        : ""
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium rounded-lg border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiBusy === "media" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                  Caption from image
                </button>
              </div>
              {selectedPlatforms.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Pick a platform first — the AI tunes the caption to it.
                </p>
              )}
              {aiError && (
                <p className="text-[11px] text-error">{aiError}</p>
              )}

              {aiVariants && aiVariants.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[11px] text-muted-foreground">
                    Pick one. Each uses a different hook angle.
                  </p>
                  <div className="space-y-2">
                    {aiVariants.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickVariant(v)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-background hover:border-accent/40 transition-colors whitespace-pre-wrap"
                      >
                        <span className="text-accent text-[10px] font-medium">
                          ANGLE {i + 1}
                        </span>
                        <p className="mt-1 text-foreground line-clamp-6">{v}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiVariants(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Hide variants
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Media Upload */}
          <Card>
            <CardTitle className="mb-3 text-base">Media</CardTitle>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />

            {mediaUrl ? (
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {mediaType === "video" ? (
                      <Video className="w-8 h-8 text-accent" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-accent" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{mediaName}</p>
                      <p className="text-xs text-muted-foreground">
                        {mediaType === "video" ? "Video" : "Image"} uploaded
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={removeMedia}
                    className="p-2 text-muted-foreground hover:text-error transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {mediaType === "video" && (
                  <video
                    src={mediaUrl}
                    controls
                    className="mt-3 rounded-lg w-full max-h-48 bg-black"
                  />
                )}
                {mediaType === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="mt-3 rounded-lg w-full max-h-48 object-cover"
                  />
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-accent/50 transition-colors cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-8 h-8 text-accent mx-auto mb-2 animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Uploading...
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop images or videos, or{" "}
                      <span className="text-accent">browse</span>
                    </p>
                    <p className="text-xs text-muted mt-1">
                      PNG, JPG, GIF, MP4 up to 100MB
                    </p>
                  </>
                )}
              </div>
            )}

            {!mediaUrl && !uploading && (
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer inline-flex items-center text-xs px-3 py-1.5 font-medium rounded-lg border border-border hover:border-border-hover text-foreground bg-transparent transition-colors"
                >
                  <ImageIcon className="w-4 h-4 mr-1" />
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer inline-flex items-center text-xs px-3 py-1.5 font-medium rounded-lg border border-border hover:border-border-hover text-foreground bg-transparent transition-colors"
                >
                  <Video className="w-4 h-4 mr-1" />
                  Video
                </button>
              </div>
            )}
          </Card>

          {/* Schedule */}
          <Card>
            <CardTitle className="mb-3 text-base">Schedule (optional)</CardTitle>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Right column - Preview & Actions */}
        <div className="space-y-4">
          <Card>
            <CardTitle className="mb-3 text-base">Preview</CardTitle>
            {selectedPlatforms.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">
                Select platforms to preview
              </p>
            ) : (
              <div className="space-y-3">
                {selectedPlatforms.map((p) => {
                  const platform = PLATFORMS.find((pl) => pl.id === p);
                  return (
                    <div
                      key={p}
                      className="border border-border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{platformIcons[p]}</span>
                        <span className="text-xs font-medium text-foreground">
                          {platform?.name}
                        </span>
                      </div>
                      {mediaUrl && mediaType === "video" && (
                        <div className="mb-2 rounded bg-black aspect-video flex items-center justify-center">
                          <Video className="w-8 h-8 text-muted" />
                        </div>
                      )}
                      {mediaUrl && mediaType === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaUrl}
                          alt="Preview"
                          className="mb-2 rounded w-full max-h-24 object-cover"
                        />
                      )}
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {caption || "Your caption will appear here..."}
                      </p>
                      {caption.length > charLimits[p] && (
                        <p className="text-xs text-error mt-1">
                          Exceeds {charLimits[p]} character limit
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Desktop publish bar — same validation as mobile so the user
              can't submit a doomed-to-fail post. The disabledReason banner
              spells out exactly what's missing instead of a silently-greyed
              button — users complain when buttons are disabled with no
              explanation. */}
          {(() => {
            const scheduleInPast = (() => {
              if (!scheduleDate || !scheduleTime) return false;
              const t = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
              return Number.isFinite(t) && t <= Date.now();
            })();
            const noPlatform = selectedPlatforms.length === 0;
            const noContent = !caption.trim() && !mediaUrl;
            const disabledReason = posting
              ? null
              : uploading
              ? "Wait for upload to finish"
              : noPlatform
              ? "Pick at least one platform above"
              : noContent
              ? "Add a caption or upload media"
              : scheduleInPast
              ? "Schedule time is in the past — pick a future moment"
              : null;
            return (
              <div className="space-y-2 hidden lg:block">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePost}
                  disabled={!!disabledReason && !posting}
                >
                  {posting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {scheduleDate ? "Schedule Post" : "Post Now"}
                    </>
                  )}
                </Button>
                {disabledReason && (
                  <p className="text-xs text-muted-foreground text-center">
                    {disabledReason}
                  </p>
                )}
                {!disabledReason && selectedPlatforms.length > 0 && (
                  <div className="text-xs text-muted text-center">
                    Posting to {selectedPlatforms.length} platform
                    {selectedPlatforms.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Mobile sticky publish bar — visible only below lg breakpoint.
          Sits over the page bottom (parent has pb-24 lg:pb-0 to clear it).
          Single primary action; secondary "Draft" deferred to desktop. */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">
              {selectedPlatforms.length === 0
                ? "Pick at least one platform"
                : `Posting to ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? "s" : ""}${scheduleDate ? ` · ${scheduleDate}` : ""}`}
            </p>
            {!mediaUrl && !caption.trim() && (
              <p className="text-[10px] text-muted">
                Add caption or media to enable
              </p>
            )}
          </div>
          <Button
            size="lg"
            onClick={handlePost}
            disabled={
              posting ||
              uploading ||
              selectedPlatforms.length === 0 ||
              (!caption.trim() && !mediaUrl)
            }
            className="shrink-0"
          >
            {posting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1.5" />
                {scheduleDate ? "Schedule" : "Post"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
