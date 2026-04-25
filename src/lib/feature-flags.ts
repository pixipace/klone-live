import { prisma } from "@/lib/prisma";

export type FeatureKey =
  | "clipper"
  | "posting"
  | "scheduling"
  | "ai"
  | "musicSfx";

const DEFAULTS: Record<FeatureKey, boolean> = {
  clipper: true,
  posting: true,
  scheduling: true,
  ai: true,
  musicSfx: true,
};

/**
 * Returns the user's per-feature enabled state. Default-on for any key
 * not explicitly set. Reads User.featureFlags JSON from DB.
 */
export async function getUserFeature(
  userId: string,
  key: FeatureKey
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureFlags: true, banned: true },
  });
  if (!user || user.banned) return false;
  if (!user.featureFlags) return DEFAULTS[key];
  try {
    const flags = JSON.parse(user.featureFlags) as Partial<Record<FeatureKey, boolean>>;
    if (flags[key] === undefined) return DEFAULTS[key];
    return flags[key]!;
  } catch {
    return DEFAULTS[key];
  }
}

export async function getAllUserFeatures(
  userId: string
): Promise<Record<FeatureKey, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureFlags: true, banned: true },
  });
  if (!user || user.banned) {
    return Object.fromEntries(
      Object.keys(DEFAULTS).map((k) => [k, false])
    ) as Record<FeatureKey, boolean>;
  }
  let flags: Partial<Record<FeatureKey, boolean>> = {};
  if (user.featureFlags) {
    try {
      flags = JSON.parse(user.featureFlags);
    } catch {
      // ignore
    }
  }
  return Object.fromEntries(
    (Object.keys(DEFAULTS) as FeatureKey[]).map((k) => [
      k,
      flags[k] === undefined ? DEFAULTS[k] : flags[k]!,
    ])
  ) as Record<FeatureKey, boolean>;
}
