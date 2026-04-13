import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-[220px]">
        <Topbar />
        <main className="p-6 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
