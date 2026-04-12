export const PLATFORMS = [
  { id: "twitter", name: "X (Twitter)", icon: "twitter", color: "#000000" },
  { id: "tiktok", name: "TikTok", icon: "music", color: "#00f2ea" },
  { id: "linkedin", name: "LinkedIn", icon: "linkedin", color: "#0077b5" },
  { id: "instagram", name: "Instagram", icon: "instagram", color: "#e4405f" },
  { id: "facebook", name: "Facebook", icon: "facebook", color: "#1877f2" },
  { id: "youtube", name: "YouTube", icon: "youtube", color: "#ff0000" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const FEATURES = [
  {
    title: "Multi-Platform Publishing",
    description:
      "Post to X, TikTok, LinkedIn, Instagram, Facebook, and YouTube from a single dashboard.",
    icon: "share2",
  },
  {
    title: "Video & Image Uploads",
    description:
      "Upload videos and images directly from your device with full preview support.",
    icon: "upload",
  },
  {
    title: "Smart Scheduling",
    description:
      "Schedule posts in advance to publish at the perfect time for your audience.",
    icon: "clock",
  },
  {
    title: "Account Management",
    description:
      "Connect and manage all your social media accounts in one secure place.",
    icon: "users",
  },
  {
    title: "Post Preview",
    description:
      "See exactly how your post will look on each platform before publishing.",
    icon: "eye",
  },
  {
    title: "Secure & Private",
    description:
      "Your credentials are encrypted and stored securely. You stay in control.",
    icon: "shield",
  },
] as const;
