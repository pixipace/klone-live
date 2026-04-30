"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Upload, Trash2, Check, Loader2, Sparkles } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type State = {
  hasReference: boolean;
  text: string;
};

/**
 * Compact panel for managing the user's F5-TTS voice reference clip.
 * The reference is mimicked when generating Explainer narration —
 * energetic ref produces energetic narration. Without one, F5-TTS
 * uses its built-in default narrator voice (passable but flat).
 */
export function VoiceReferencePanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [transcript, setTranscript] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/user/voice-reference");
      const data = await res.json();
      if (res.ok) setState(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const upload = async () => {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick an audio file (5-15s WAV / MP3 / M4A)");
      return;
    }
    if (transcript.trim().length < 3) {
      setError("Paste the verbatim transcript of the clip — F5-TTS needs it for cloning");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      fd.append("text", transcript.trim());
      const res = await fetch("/api/user/voice-reference", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      setState({ hasReference: true, text: data.text });
      setShowUpload(false);
      setTranscript("");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove your voice reference?",
      description: "Future explainers will use the default narrator voice. You can upload a new reference any time.",
      destructive: true,
      confirmLabel: "Remove voice",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/user/voice-reference", { method: "DELETE" });
      if (res.ok) {
        setState({ hasReference: false, text: "" });
        toast.success("Voice reference removed");
      } else {
        toast.error("Couldn't remove", "Try again in a moment");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-3 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-success" />
          <span className="text-sm font-semibold">Narration voice</span>
          {state?.hasReference ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30 inline-flex items-center gap-1">
              <Check className="w-2.5 h-2.5" />
              Custom voice
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              Default narrator
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {state?.hasReference && !showUpload && (
            <button
              onClick={remove}
              disabled={busy}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-error/40 hover:text-error transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          )}
          {!showUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-colors"
            >
              <Upload className="w-3 h-3" />
              {state?.hasReference ? "Replace" : "Upload"}
            </button>
          )}
        </div>
      </div>

      {state?.hasReference && !showUpload && (
        <p className="text-[11px] text-muted-foreground italic">
          &ldquo;{state.text.slice(0, 140)}
          {state.text.length > 140 ? "…" : ""}&rdquo;
        </p>
      )}

      {!state?.hasReference && !showUpload && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Upload a 5-15 second clip of any voice (yours, a YouTuber's energy
          you like, anything) and the narration will mimic its prosody.
          Energetic ref → energetic narration.
        </p>
      )}

      {showUpload && (
        <div className="space-y-2 mt-2">
          <input
            ref={fileRef}
            type="file"
            accept="audio/wav,audio/mp3,audio/mpeg,audio/m4a,audio/mp4"
            disabled={busy}
            className="block w-full text-xs file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-success/15 file:text-success file:font-medium hover:file:bg-success/25"
          />
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value.slice(0, 500))}
            placeholder="Paste the EXACT words spoken in the clip. F5-TTS uses this for phoneme alignment — accuracy matters."
            disabled={busy}
            rows={2}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-success/50 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={upload}
              disabled={busy}
              className="text-[11px] px-3 py-1 rounded bg-success text-white font-medium hover:bg-success/90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {busy ? "Uploading…" : "Save"}
            </button>
            <button
              onClick={() => {
                setShowUpload(false);
                setTranscript("");
                setError(null);
              }}
              disabled={busy}
              className="text-[11px] px-3 py-1 rounded border border-border hover:border-foreground/30 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-error mt-1.5">{error}</p>}
    </div>
  );
}
