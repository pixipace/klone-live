import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { notifyOnPost: true, audienceTimezone: true },
  });

  return (
    <SettingsClient
      user={{
        id: session.id,
        name: session.name,
        email: session.email,
        plan: session.plan,
        notifyOnPost: user?.notifyOnPost ?? true,
        audienceTimezone: user?.audienceTimezone ?? null,
      }}
    />
  );
}
