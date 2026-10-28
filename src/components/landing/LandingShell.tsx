import type { ReactNode } from "react";
import Link from "next/link";
import { ForceLightTheme } from "@/components/landing/ForceLightTheme";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/apps", label: "Mobile apps" },
  { href: "/pricing", label: "Pricing" },
];

// The header and footer shared by the home page and its sub-pages
// (/features, /apps, /pricing).
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ForceLightTheme />
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button nativeButton={false} render={<Link href="/login">Get Started</Link>} />
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <div>
            <Logo size="sm" />
            <p className="mt-1 text-xs text-muted-foreground">Built for the churches, by the church.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-6">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Android app
            </a>
            {APP_STORE_URL && (
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                iPhone app
              </a>
            )}
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground">About Us</Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Use</Link>
            <Link href="/refund" className="text-sm text-muted-foreground hover:text-foreground">Refund Policy</Link>
            <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground">Contact Us</Link>
          </nav>
          <div className="space-y-0.5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">KingdomFlow</p>
            <p>Operated by PHILOMINA VINCENT KOUNDER</p>
            <p>Mother Theresa Society, Anthony Church Road, Tembipada, Bhandup West, Mumbai 400078</p>
            <p>© {new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
