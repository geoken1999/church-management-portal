import Link from "next/link";
import { requireSupportAccess } from "@/lib/support-staff/access";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/auth/LogoutButton";

// The support person's console: tickets and a read-only look at a church. A separate shell from the church dashboard
// and from Super Admin; the gate is requireSupportAccess (Super Admin or an active support-staff account).
export default async function SupportDeskLayout({ children }: { children: React.ReactNode }) {
  const access = await requireSupportAccess();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/support-desk">
              <Logo size="sm" />
            </Link>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Support</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{access.name}</span>
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 py-1 sm:px-6">
          <Link href="/support-desk" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Tickets
          </Link>
          <Link href="/support-desk/tenants" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Churches
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
