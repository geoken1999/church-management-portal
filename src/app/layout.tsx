import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

// DM Sans: matches the KingdomFlow reference design (launchpados.in) — one
// family for both headings and body, leaning on weight for hierarchy.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "KingdomFlow",
    template: "%s",
  },
  description: "KingdomFlow — a connected platform for church management.",
};

// Without this, mobile browsers have no width=device-width to go on and
// fall back to rendering at a ~980px desktop-simulation viewport, then
// scaling the whole page down to fit the screen — every page looks
// uniformly "shrunk" and zoomed out on a phone, not just this one. Next.js
// requires this as its own export (not metadata.viewport, which it no
// longer reads) for the <meta name="viewport"> tag to be emitted at all.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: some browser extensions (e.g. ColorZilla)
          inject attributes like cz-shortcut-listen onto <body> before React
          hydrates — that's a client-only DOM mutation from outside our
          code, not a real server/client mismatch, so it's silenced here
          rather than "fixed" (there's nothing in our render to fix). */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Shows a top progress bar on every route transition — App Router
            gives no built-in "navigation pending" signal, and per-page
            loading.tsx skeletons would mean writing one per route, so this
            covers "any page is loading" uniformly from one place. */}
        <NextTopLoader color="var(--primary)" showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
