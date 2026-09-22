import Link from "next/link";
import {
  Contact,
  HeartHandshake,
  ListTodo,
  HandCoins,
  Mail,
  Share2,
  ShieldCheck,
  MapPin,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingSection } from "@/components/landing/PricingSection";

const FEATURES = [
  {
    icon: Contact,
    title: "Congregation management",
    description: "Members, branches, leaders, and youth rosters in one place, with a public join link for new members to sign themselves up.",
  },
  {
    icon: HeartHandshake,
    title: "Ministries & events",
    description: "Track ministries, worship teams, and media crews, and run a shared events calendar with recurring services and RSVPs.",
  },
  {
    icon: ListTodo,
    title: "Team to-dos",
    description: "Assign tasks to staff and volunteers with due dates, reminders, and a calendar export.",
  },
  {
    icon: HandCoins,
    title: "Giving & fundraising",
    description: "Run fundraising campaigns toward a goal, log offerings collected during services, and record donations from members and guests.",
  },
  {
    icon: Mail,
    title: "Email & SMS campaigns",
    description: "Reach your whole congregation with bulk email newsletters and text announcements, sent right from the app.",
  },
  {
    icon: Share2,
    title: "Social media hub",
    description: "Manage Instagram, YouTube, and Facebook posts, comments, and messages without leaving your dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    description: "Issue logins for staff and volunteers with per-section Read, Write, and Delete permissions — no shared passwords.",
  },
  {
    icon: MapPin,
    title: "Multi-branch support",
    description: "Manage every campus from one account, each with its own leader, country, and phone number formatting.",
  },
  {
    icon: Lock,
    title: "Secure by design",
    description: "Built on Supabase with row-level security, so every church's data stays isolated from every other church on the platform.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
              Features
            </a>
            <a href="#pricing" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
              Pricing
            </a>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button nativeButton={false} render={<Link href="/login">Get Started</Link>} />
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
            aria-hidden
          />
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              All-in-one church management
            </Badge>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Shepherd your church with clarity.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground text-balance">
              KingdomFlow brings your congregation, ministries, giving, and communication into one connected
              platform — so your team spends less time on spreadsheets and more time on people.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/login">Get Started</Link>} />
              <Button size="lg" variant="outline" nativeButton={false} render={<a href="#pricing">See pricing</a>} />
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight">Everything your church needs, connected</h2>
              <p className="mt-3 text-muted-foreground">
                Nine modules built specifically for how churches actually run — not a generic CRM bolted onto a
                spreadsheet.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                      <feature.icon className="size-5 text-primary" />
                    </div>
                    <CardTitle className="mt-2">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-muted/40 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
              <p className="mt-3 text-muted-foreground">Start small. Upgrade as your church and ministry grow.</p>
            </div>
            <div className="mt-12">
              <PricingSection />
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Secure payments via Razorpay. Cancel anytime from your dashboard.
            </p>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">Ready to get started?</h2>
            <p className="mt-3 text-muted-foreground">
              Create your church&apos;s account in minutes — no credit card required.
            </p>
            <div className="mt-8">
              <Button size="lg" nativeButton={false} render={<Link href="/login">Get Started</Link>} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} KingdomFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
