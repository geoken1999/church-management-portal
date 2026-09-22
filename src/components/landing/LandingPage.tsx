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
  ClipboardCheck,
  FolderOpen,
  FileBarChart,
  FileText,
  CalendarDays,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  UserPlus,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingSection } from "@/components/landing/PricingSection";
import { DashboardPreview } from "@/components/landing/DashboardPreview";

const STATS = [
  { value: "20+", label: "built-in modules" },
  { value: "3-day", label: "free trial, no card" },
  { value: "Multi-branch", label: "ready from day one" },
  { value: "Row-level", label: "security by Supabase" },
];

const STEPS = [
  {
    icon: Sparkles,
    title: "Create your church's account",
    description: "Set your church's name, congregation size, branches, and country — done in under two minutes, with a 3-day full-access trial started automatically.",
  },
  {
    icon: UserPlus,
    title: "Bring your congregation in",
    description: "Bulk-import your roster from an Excel template, or share a public join link and let new members sign themselves up for approval.",
  },
  {
    icon: LayoutDashboard,
    title: "Run everything from one dashboard",
    description: "Invite your team with scoped Read/Write/Delete permissions, then manage ministries, attendance, giving, and communication without switching apps.",
  },
];

interface FeatureItem {
  icon: typeof Contact;
  title: string;
  description: string;
}

interface FeatureCategory {
  title: string;
  blurb: string;
  items: FeatureItem[];
}

const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    title: "People & Congregation",
    blurb: "Everyone in your church, organized and easy to reach.",
    items: [
      {
        icon: Contact,
        title: "Members, Leaders & Youth",
        description: "A full congregation roster with a dedicated Leaders list and a separate Youth roster with guardian details, plus a public join link for self-signup.",
      },
      {
        icon: MapPin,
        title: "Multi-branch support",
        description: "Manage every campus from one account, each with its own leader, country, and phone-number formatting.",
      },
      {
        icon: ClipboardCheck,
        title: "Attendance",
        description: "Take attendance by branch and link a session to a specific date of a calendar event — with a manual check-in for anyone not on the default list.",
      },
      {
        icon: ShieldCheck,
        title: "Team permissions",
        description: "Issue logins for staff and volunteers with per-tab Read, Write, and Delete access. Every tab starts read-only until an admin opens it up.",
      },
    ],
  },
  {
    title: "Ministry Tools",
    blurb: "The day-to-day of running ministries and services.",
    items: [
      {
        icon: HeartHandshake,
        title: "Ministries, Worship & Media",
        description: "Track every ministry your church runs, your worship team roster, and your media crew — with shared documents for chord charts and production files.",
      },
      {
        icon: CalendarDays,
        title: "Events calendar",
        description: "One-off and recurring events — daily, weekly, monthly, or yearly — online or in-person, scoped to a branch and a manager.",
      },
      {
        icon: ListTodo,
        title: "To Do",
        description: "A shared task list for your team, with due dates and a calendar export so nothing falls through the cracks.",
      },
    ],
  },
  {
    title: "Tools",
    blurb: "Documents, forms, and reporting that stay out of the way.",
    items: [
      {
        icon: FolderOpen,
        title: "Folder",
        description: "A private document library with category-based, opt-in shareable links — control exactly what's public, and revoke a link the moment you need to.",
      },
      {
        icon: FileBarChart,
        title: "Reports",
        description: "Filter Members, Attendance, Events, Offerings, and Donations data by date or branch, then export straight to Excel or PDF.",
      },
      {
        icon: FileText,
        title: "Forms",
        description: "Build custom public forms and collect responses directly into your dashboard — no separate form tool to manage.",
      },
    ],
  },
  {
    title: "Finance",
    blurb: "Giving, tracked without a separate spreadsheet.",
    items: [
      {
        icon: HandCoins,
        title: "Fund Raiser, Offering & Donation",
        description: "Run campaigns toward a goal, log offerings collected during services, and record donations — the raised total updates automatically as donations come in.",
      },
    ],
  },
  {
    title: "Messaging & Social",
    blurb: "Reach your congregation wherever they already are.",
    items: [
      {
        icon: Mail,
        title: "Email & SMS campaigns",
        description: "Send bulk newsletters and text announcements from the app, metered by your plan or unmetered with your own SMTP server.",
      },
      {
        icon: Share2,
        title: "Social media hub",
        description: "Manage Instagram, YouTube, and Facebook without leaving your dashboard — connect and switch between multiple YouTube channels from one place.",
      },
    ],
  },
];

const SECURITY_POINTS = [
  "Row-level security on every table — your church's data is isolated from every other church on the platform, enforced at the database, not just the app.",
  "Owner, Admin, and Member roles, with per-tab Read/Write/Delete permissions for every Member-role login — no shared passwords, ever.",
  "New tabs default to read-only for existing team members, even ones added after your account was created — access only ever grows when an admin grants it.",
  "Shareable links you control — Folder's document and category links are opt-in and can be revoked the instant you need to.",
];

const FAQS = [
  {
    question: "Is there a free trial?",
    answer: "Yes — every new organization gets 3 days of full Basic-plan access with no credit card required.",
  },
  {
    question: "What happens when the trial ends?",
    answer: "An owner or admin needs to subscribe from the Billing page to keep using the app. Other team members will see a message asking them to contact an owner or admin.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes, from the Billing page. Cancellation takes effect immediately rather than at the end of your paid period, so there's no partial refund for the unused remainder.",
  },
  {
    question: "Which plan includes Finance and Social Media?",
    answer: "Finance (Fund Raiser, Offering, Donation) is included on Premium and Pro. Social Media (Instagram, YouTube, Facebook) is included on Pro only.",
  },
  {
    question: "Can I switch between Monthly and Annual billing?",
    answer: "Not in place — cancel your current subscription first, then subscribe again on the plan or interval you want.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
              Features
            </a>
            <a href="#how-it-works" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
              How it works
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
        <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
            aria-hidden
          />
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="size-3" />
              All-in-one church management
            </Badge>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Shepherd your church with{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">clarity</span>.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground text-balance">
              KingdomFlow brings your congregation, ministries, attendance, giving, and communication into one
              connected platform — so your team spends less time on spreadsheets and more time on people.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/login">Get Started<ArrowRight className="size-4" /></Link>} />
              <Button size="lg" variant="outline" nativeButton={false} render={<a href="#pricing">See pricing</a>} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No credit card required · 3-day free trial · Cancel anytime</p>
          </div>

          <div className="mt-16 sm:mt-20">
            <DashboardPreview />
          </div>

          <div className="mx-auto mt-20 grid max-w-4xl grid-cols-2 gap-6 sm:mt-24 sm:grid-cols-4 sm:gap-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-heading text-2xl font-bold text-primary sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-4">
                Getting started
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight">Up and running in three steps</h2>
              <p className="mt-3 text-muted-foreground">No onboarding call needed — most churches are fully set up the same day.</p>
            </div>
            <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative text-center sm:text-left">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground sm:mx-0">
                    <step.icon className="size-5" />
                  </div>
                  <p className="mt-4 font-heading text-xs font-bold tracking-wide text-primary uppercase">Step {index + 1}</p>
                  <h3 className="mt-1 font-heading text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-muted/40 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-4">
                Everything in one place
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight">Every module your church needs, connected</h2>
              <p className="mt-3 text-muted-foreground">
                Built specifically for how churches actually run — not a generic CRM bolted onto a spreadsheet.
              </p>
            </div>

            <div className="mt-16 space-y-16">
              {FEATURE_CATEGORIES.map((category) => (
                <div key={category.title}>
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-heading text-xl font-bold">{category.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{category.blurb}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {category.items.map((feature) => (
                      <Card
                        key={feature.title}
                        className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-primary/20"
                      >
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
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge variant="secondary" className="mb-4">
                <Lock className="size-3" />
                Security
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight text-balance">
                Built to keep your congregation&apos;s data safe by default
              </h2>
              <p className="mt-3 text-muted-foreground">
                Security isn&apos;t a setting you have to turn on — it&apos;s how every tab and every login already works.
              </p>
              <ul className="mt-8 space-y-4">
                {SECURITY_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,var(--color-accent),transparent)] opacity-60 blur-2xl"
                aria-hidden
              />
              <Card size="lg" className="mx-auto max-w-sm">
                <CardHeader>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <ShieldCheck className="size-7" />
                  </div>
                  <CardTitle className="mt-4 text-xl">Row-level security</CardTitle>
                  <CardDescription>Every query is scoped to your organization at the database layer — not just hidden in the UI.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Owner, Admin, Member roles</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Per-tab Read / Write / Delete</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FolderOpen className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Revocable shareable links</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-muted/40 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-4">
                Pricing
              </Badge>
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
          <div className="mx-auto max-w-3xl">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-4">
                FAQ
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight">Common questions</h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group rounded-xl border border-border bg-card px-5 py-4 open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-sm font-bold">
                    {faq.question}
                    <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                      <ArrowRight className="size-4 -rotate-45" />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 px-6 py-16 text-center shadow-2xl shadow-primary/20 sm:px-16">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-balance text-primary-foreground sm:text-4xl">
              Ready to bring it all together?
            </h2>
            <p className="mt-3 text-primary-foreground/80">
              Create your church&apos;s account in minutes — no credit card required.
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                variant="secondary"
                nativeButton={false}
                render={<Link href="/login">Get Started<ArrowRight className="size-4" /></Link>}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <Logo size="sm" />
          <nav className="flex flex-wrap items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} KingdomFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
