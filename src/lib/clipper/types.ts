export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

export type WhisperResult = {
  language: string;
  segments: WhisperSegment[];
};

export type ClipPick = {
  startSec: number;
  endSec: number;
  hookTitle: string;
  reason: string;
  viralityScore: number;
};

export type ClipPickResponse = {
  clips: ClipPick[];
};

export type ClipperJobStage =
  | "QUEUED"
  | "DOWNLOADING"
  | "TRANSCRIBING"
  | "PICKING"
  | "CUTTING"
  | "DONE"
  | "FAILED";

export const CLIPPER_DIRS = {
  workRoot: "/tmp/klone-clipper",
} as const;
