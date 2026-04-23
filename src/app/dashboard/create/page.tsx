"use client";

import { useState, useRef } from "react";
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
  const [aiBusy, setAiBusy] = useState<"generate" | "rewrite" | "hashtags" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const callAi = async (
    mode: "generate" | "rewrite" | "hashtags",
    body: Record<string, unknown>
  ) => {
    setAiBusy(mode);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI failed");
      return data as { caption?: string; hashtags?: string[] };
    } catch (err) {
      setAiError(String(err instanceof Error ? err.message : err));
      return null;
    } finally {
      setAiBusy(null);
    }
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

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          mediaUrl,
          mediaType,
          platforms: selectedPlatforms,
          scheduleDate,
          scheduleTime,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Result Banner */}
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
          {/* Platform Selector */}
          <Card>
            <CardTitle className="mb-3 text-base">Select Platforms</CardTitle>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    selectedPlatforms.includes(platform.id)
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border-hover"
                  }`}
                >
                  <span className="text-base">
                    {platformIcons[platform.id]}
                  </span>
                  {platform.name}
                  {selectedPlatforms.includes(platform.id) && (
                    <X className="w-3 h-3" />
                  )}
                </button>
              ))}
            </div>
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
              </div>
              {selectedPlatforms.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Pick a platform first — the AI tunes the caption to it.
                </p>
              )}
              {aiError && (
                <p className="text-[11px] text-error">{aiError}</p>
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

          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={handlePost}
              disabled={posting || uploading}
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
            <Button variant="outline" className="w-full">
              <Eye className="w-4 h-4 mr-2" />
              Save as Draft
            </Button>
          </div>

          {selectedPlatforms.length > 0 && (
            <div className="text-xs text-muted text-center">
              Posting to {selectedPlatforms.length} platform
              {selectedPlatforms.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
