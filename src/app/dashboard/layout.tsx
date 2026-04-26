import { DashboardShell } from "@/components/dashboard/shell";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell impersonationBanner={<ImpersonationBanner />}>
      {children}
    </DashboardShell>
  );
}
