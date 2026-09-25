import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlatformAdminNav } from "@/components/platform-admin/PlatformAdminNav";

// A separate top-level shell from the org dashboard (src/app/dashboard) —
// this is a single-operator, cross-tenant surface with its own gate
// (requirePlatformAdmin, a plain email allowlist — see its doc comment),
// so it deliberately doesn't reuse DashboardShell, which is scoped to one
// organization's membership/permissions.
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/platform-admin">
              <Logo size="sm" />
            </Link>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Super Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Back to my church
            </Link>
            <LogoutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <PlatformAdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
