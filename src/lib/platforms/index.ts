import type { PlatformPostInput, PlatformResult } from "./types";
import { postToTikTok } from "./tiktok";
import { postToFacebook } from "./facebook";
import { postToInstagram } from "./instagram";
import { postToLinkedIn } from "./linkedin";
import { postToYouTube } from "./youtube";

export type PlatformId =
  | "tiktok"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube";

export const platformPosters: Record<
  PlatformId,
  (input: PlatformPostInput) => Promise<PlatformResult>
> = {
  tiktok: postToTikTok,
  facebook: postToFacebook,
  instagram: postToInstagram,
  linkedin: postToLinkedIn,
  youtube: postToYouTube,
};

export const ALL_PLATFORMS: PlatformId[] = [
  "tiktok",
  "facebook",
  "instagram",
  "linkedin",
  "youtube",
];

export type { PlatformPostInput, PlatformResult } from "./types";
