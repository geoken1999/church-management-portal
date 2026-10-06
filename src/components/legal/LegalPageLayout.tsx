import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

// Shared chrome for /privacy and /terms — same header/footer pattern as
// LandingPage.tsx, but scoped to a single narrow reading column instead of
// the marketing page's full-width sections, since this is just long-form
// text.
export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  // Omitted for pages that aren't versioned legal text (About, Contact) —
  // shown only for the documents that actually change over time (Privacy,
  // Terms, Refund).
  lastUpdated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="KingdomFlow home">
            <Logo />
          </Link>
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
        {lastUpdated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>}
        <div className="mt-10">{children}</div>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} KingdomFlow, operated by PHILOMINA VINCENT KOUNDER. All rights reserved.</p>
          <nav className="flex flex-wrap gap-6">
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground">
              About Us
            </Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
              Terms of Use
            </Link>
            <Link href="/refund" className="text-sm text-muted-foreground hover:text-foreground">
              Refund Policy
            </Link>
            <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground">
              Contact Us
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-heading text-xl font-bold tracking-tight">{heading}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:text-foreground [&_strong]:font-medium [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
