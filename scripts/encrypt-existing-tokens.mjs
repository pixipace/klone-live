#!/usr/bin/env node
/**
 * One-shot migration: encrypt any SocialAccount.accessToken / refreshToken
 * rows that are still plaintext (no "v1:" prefix).
 *
 * Safe to re-run — encrypted rows are skipped.
 *
 * Usage: node scripts/encrypt-existing-tokens.mjs
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function getKey() {
  const explicit = process.env.TOKEN_ENC_KEY;
  if (explicit) {
    const buf =
      explicit.length === 64
        ? Buffer.from(explicit, "hex")
        : Buffer.from(explicit, "base64");
    if (buf.length !== 32) {
      throw new Error("TOKEN_ENC_KEY must decode to 32 bytes");
    }
    return buf;
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Need NEXTAUTH_SECRET (>=32 chars) or TOKEN_ENC_KEY");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptToken(plain) {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

async function main() {
  const accounts = await prisma.socialAccount.findMany();
  let migrated = 0;
  let skipped = 0;

  for (const account of accounts) {
    const accessIsPlain =
      account.accessToken && !account.accessToken.startsWith("v1:");
    const refreshIsPlain =
      account.refreshToken && !account.refreshToken.startsWith("v1:");

    if (!accessIsPlain && !refreshIsPlain) {
      skipped += 1;
      continue;
    }

    const updates = {};
    if (accessIsPlain) updates.accessToken = encryptToken(account.accessToken);
    if (refreshIsPlain) updates.refreshToken = encryptToken(account.refreshToken);

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: updates,
    });

    console.log(
      `✓ encrypted ${account.platform} account for user ${account.userId} (${[
        accessIsPlain && "accessToken",
        refreshIsPlain && "refreshToken",
      ]
        .filter(Boolean)
        .join(" + ")})`
    );
    migrated += 1;
  }

  console.log(
    `\nDone — ${migrated} migrated, ${skipped} already encrypted (or empty).`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
