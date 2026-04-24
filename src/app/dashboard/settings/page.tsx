import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SettingsClient
      user={{
        id: session.id,
        name: session.name,
        email: session.email,
        plan: session.plan,
      }}
    />
  );
}
