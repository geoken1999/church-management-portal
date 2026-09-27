import type { DocCategory } from "@/lib/docs/content";

// Internal ops/support runbook for whoever operates KingdomFlow itself —
// distinct from src/lib/docs/content.ts, which is customer-facing help for
// church admins using the product. Rendered by DocumentationBrowser at
// /platform-admin/docs, gated the same way as every other platform-admin
// page (requirePlatformAdmin). Keep entries here in sync with reality as
// infrastructure changes — a stale runbook is worse than none, since it's
// trusted during an incident.
export const SUPPORT_GUIDE_CATEGORIES: DocCategory[] = [
  {
    id: "overview",
    title: "System Overview",
    articles: [
      {
        id: "what-it-is",
        title: "What KingdomFlow is",
        body: [
          "A multi-tenant SaaS app that gives a church (an \"organization\") a dashboard for managing their congregation, branches, events, giving, and outbound communication (email/SMS/WhatsApp), plus a set of public, unauthenticated pages their visitors interact with directly — join requests, event registration, online giving, form fills, and shared document folders.",
        ],
      },
      {
        id: "stack",
        title: "The stack",
        body: [
          "- App framework: Next.js (App Router), Server Actions for almost all writes — there's no separate API layer for the dashboard itself.",
          "- Hosting: Vercel, currently on the Hobby plan. See \"Known infrastructure constraints\" for what that limits.",
          "- Database, Auth, and Storage: Supabase (Postgres 17), currently on the smallest compute tier.",
          "- Database access: exclusively through @supabase/supabase-js via PostgREST — no raw Postgres connections anywhere in the app code.",
          "- Payments: Razorpay, for both subscription plans and one-off giving links.",
          "- Transactional email: Resend — registration passes, reminders, receipts, and the daily health report.",
          "- SMS and WhatsApp: Twilio — campaigns plus delivery-status webhooks.",
          "- Social integrations: Instagram, Facebook, and YouTube Graph APIs, connected per organization via OAuth.",
        ],
      },
      {
        id: "multi-tenancy",
        title: "How multi-tenancy works",
        body: [
          "Every tenant-scoped table carries an organization_id and is protected by Postgres Row-Level Security via an is_org_member() check — a signed-in user can only ever see rows for organizations they belong to.",
          "Platform Admin pages deliberately bypass this: they use a service-role Supabase client (createAdminClient()) since no RLS policy safely allows cross-org reads, with access gated entirely at the page layer by requirePlatformAdmin(), which checks the signed-in email against the PLATFORM_ADMIN_EMAILS allow-list.",
        ],
      },
    ],
  },
  {
    id: "access",
    title: "Access & Environments",
    articles: [
      {
        id: "where-things-live",
        title: "Where things live",
        body: [
          "- Production: kingdomflow.in. Vercel project name: church-management-portal.",
          "- Database: Supabase project mkggneihczlvfhkqloud, region ap-northeast-1.",
          "- Platform Admin: /platform-admin, gated by the PLATFORM_ADMIN_EMAILS env var (a comma-separated allow-list).",
          "- Secrets: Vercel → Project → Settings → Environment Variables, scoped to Production.",
        ],
      },
      {
        id: "env-var-gotchas",
        title: "The most common cause of \"it works locally but not in production\"",
        body: [
          "Every server-only env var, and every NEXT_PUBLIC_ var, has to be added to Vercel's Production environment separately from .env.local — the two are not connected in any way.",
          "This has already caused two real incidents: a password-reset link pointing at the wrong domain (NEXT_PUBLIC_SITE_URL missing from Production), and months of a daily health-report email silently failing (HEALTH_REPORT_EMAIL missing from Production, present only locally). When something behaves differently in production than locally, checking the Vercel env var list is the first move, not the last.",
          "Adding or changing a Vercel env var does nothing to an already-running deployment — server code and NEXT_PUBLIC_ values are both baked in at build time. After changing one, trigger a redeploy before assuming the fix landed.",
        ],
      },
    ],
  },
  {
    id: "admin-tools",
    title: "Platform Admin Toolkit",
    articles: [
      {
        id: "admin-pages",
        title: "Every page under /platform-admin",
        body: [
          "- Overview (/platform-admin): org counts, growth, and a feed of recent platform events.",
          "- Tenants (/platform-admin/tenants): every organization, with a \"View details\" drill-down per tenant showing congregation size, branches, team logins, email/SMS/WhatsApp sent (this month and all-time), storage used, giving totals, and delivery failures — exportable as Excel or PDF, per-tenant or for all tenants combined.",
          "- Sessions (/platform-admin/sessions): every currently-valid sign-in across every tenant, labeled with the user's email and which organization(s) they belong to, with a one-click \"Sign out\" per session.",
          "- Health (/platform-admin/health): live reachability/config checks for Twilio, Resend, Razorpay, Instagram, Facebook, and YouTube, plus recent Vercel deployments.",
          "- Logs (/platform-admin/logs): the platform_events feed — warnings and errors from webhooks, email sends, and cron runs. The first place to look for any \"X didn't happen\" report.",
          "- Payouts (/platform-admin/payouts): tracking for shared-fundraiser payouts owed to organizations using the platform's shared Razorpay account.",
          "- Support (/platform-admin/support): the admin side of customer support tickets — the same threads customers raise from their dashboard's Support tab.",
          "- Docs (/platform-admin/docs): this page.",
        ],
      },
      {
        id: "usage-lookup",
        title: "Answering a tenant usage or quota question",
        body: [
          "Before answering a billing or quota question by guessing, open Tenants, find the church, and click \"View details\". It's a live aggregate query, not a cached estimate.",
        ],
      },
    ],
  },
  {
    id: "cron",
    title: "Scheduled Jobs",
    articles: [
      {
        id: "cron-list",
        title: "The three cron jobs",
        body: [
          "- /api/cron/event-reminders — 45 2 * * * UTC (about 8:15 AM IST) — sends \"24h before\" and \"morning of\" event registration reminder emails.",
          "- /api/cron/daily-health-report — 30 4 * * * UTC (about 10:00 AM IST) — emails a platform health summary to HEALTH_REPORT_EMAIL.",
          "- /api/instagram/cron/refresh-tokens — 0 3 * * * UTC (about 8:30 AM IST) — refreshes Instagram long-lived tokens before they expire.",
          "All three are locked to once a day because Vercel's Hobby plan rejects any cron schedule finer than daily at deploy time — this is a hard platform ceiling, not a choice. The practical effect: an event's \"1 hour before\" reminder option can only fire if that moment happens to land within a few minutes of the one fixed daily run, so it's functionally unreliable today. Upgrading to Vercel Pro removes this ceiling.",
        ],
      },
      {
        id: "cron-manual-test",
        title: "Manually triggering a cron job for testing",
        body: [
          "Both routes check a CRON_SECRET bearer token. Vercel automatically sends this as \"Authorization: Bearer $CRON_SECRET\" on its own scheduled calls — no extra wiring needed for the real cron to work.",
          "To test by hand: curl -H \"Authorization: Bearer <secret>\" https://kingdomflow.in/api/cron/<job>. The secret value lives in Vercel's env vars.",
          "Read the JSON response directly — each route returns a small summary (for example eventsChecked and remindersSent counts) rather than just a 200 OK.",
        ],
      },
    ],
  },
  {
    id: "playbooks",
    title: "Troubleshooting Playbooks",
    articles: [
      {
        id: "missing-email",
        title: "A scheduled email never arrived",
        body: [
          "1. Check Platform Admin → Logs for an email_send warning around the expected time. No warning at all is itself informative — see step 3.",
          "2. Confirm RESEND_API_KEY and EMAIL_FROM_ADDRESS are set in Vercel Production (the Health page also surfaces Resend's config status).",
          "3. If it's one of the two cron-sent reports, hit the route directly with the CRON_SECRET bearer token. A missing recipient or config env var makes the route fail before it ever logs anything — exactly what happened with HEALTH_REPORT_EMAIL being present locally but never added to Production: the report silently failed every day since the cron was created, with zero trace in Logs.",
        ],
      },
      {
        id: "wrong-domain",
        title: "Password reset or magic link opens the wrong domain",
        body: [
          "1. Confirm NEXT_PUBLIC_SITE_URL is set to https://kingdomflow.in in Vercel Production.",
          "2. Redeploy after setting it. This is a NEXT_PUBLIC_ var, inlined at build time — saving it in the dashboard alone changes nothing until the next build.",
          "3. Separately, check Supabase → Authentication → URL Configuration → Redirect URLs includes https://kingdomflow.in/**. Supabase silently falls back to its own configured Site URL if the app's redirectTo isn't on this allow-list, regardless of what NEXT_PUBLIC_SITE_URL says.",
        ],
      },
      {
        id: "razorpay-signature",
        title: "Repeated \"Invalid Razorpay webhook signature\" warnings in Logs",
        body: [
          "This pattern has shown up repeatedly in production logs. It means RAZORPAY_WEBHOOK_SECRET doesn't match the secret configured against this exact endpoint in the Razorpay dashboard's webhook settings.",
          "A mismatch here doesn't just log noise — it silently drops every subscription status update (renewals, cancellations, failed payments), so a tenant's billing state can quietly drift from what Razorpay actually has.",
          "Fix: re-copy the webhook secret from Razorpay's dashboard, confirm it matches Vercel's RAZORPAY_WEBHOOK_SECRET exactly, then redeploy.",
        ],
      },
      {
        id: "supabase-pause",
        title: "Site or API behaving oddly after a quiet period",
        body: [
          "Supabase's current compute tier can auto-pause a project after about 7 days with no activity (free-tier behavior). Check the project status in the Supabase dashboard first — resuming it is a manual step, there's no automatic wake-on-request.",
        ],
      },
      {
        id: "force-sign-out",
        title: "A customer needs to be signed out of a lost device or a suspected compromised account",
        body: [
          "Platform Admin → Sessions lists every currently-valid sign-in platform-wide, labeled by user email and organization. Find the session (cross-check the IP or last-active time if the user has more than one) and click Sign out.",
          "This takes effect on that session's very next request, not after the access token's own one-hour expiry — the app's proxy.ts revalidates every request against the Auth server rather than trusting a locally-decoded token.",
          "The user isn't locked out of the account itself, only that one session — they can sign back in immediately from anywhere.",
        ],
      },
      {
        id: "partial-campaign",
        title: "A campaign send seems to have only partially gone out",
        body: [
          "Vercel Hobby caps function execution at 10 seconds by default, 60 seconds max even if explicitly configured — no route in this app currently overrides that.",
          "A large recipient list sent synchronously inside one Server Action or cron invocation can realistically approach that ceiling.",
          "Check message_delivery_events (via the tenant's usage page, or a direct query) for how many rows actually got created for that campaign versus the recipient count.",
        ],
      },
    ],
  },
  {
    id: "constraints",
    title: "Known Infrastructure Constraints",
    articles: [
      {
        id: "current-constraints",
        title: "Real, current limits — worth knowing before promising a customer something the infrastructure can't yet back up",
        body: [
          "- Vercel plan: Hobby tier. Once-daily cron ceiling (see Scheduled Jobs); 10s/60s function duration cap; Hobby's terms are for personal/non-commercial use, worth noting since the app charges real customers via Razorpay.",
          "- Supabase plan: smallest/free compute. max_connections is 60; there's no point-in-time recovery backup; free-tier projects can auto-pause after inactivity.",
          "- Rate limiting: none configured anywhere. Public pages (Join, Forms, Give, Event registration) and every webhook endpoint have no request throttling — src/proxy.ts only refreshes the auth session.",
          "- Data retention: none implemented. message_delivery_events, notifications, and platform_events all grow indefinitely — there's no cleanup job yet.",
          "None of this is unusual for an early-stage product — it's written down so a conversation about \"why can't we do X\" has a real answer instead of a guess, and so nobody re-diagnoses the same known limit twice.",
        ],
      },
    ],
  },
  {
    id: "outstanding",
    title: "Outstanding Items",
    articles: [
      {
        id: "outstanding-list",
        title: "Tracked here so nothing gets lost between conversations — update as items close",
        body: [
          "- Migration 0082_event_hybrid_mode.sql: not yet run against production. Hybrid (in-person + online) events aren't usable until it's run via the Supabase SQL Editor.",
          "- Data retention policy: proposed (90 days for delivery logs, 1 year for platform events, 60-90 days for read notifications) but not yet built.",
          "- Rate limiting on public and webhook routes: recommended approach is Upstash Redis with @upstash/ratelimit.",
          "- Vercel and Supabase plan upgrade: would remove the cron, duration, connection, and backup constraints above.",
        ],
      },
    ],
  },
  {
    id: "customer-help-index",
    title: "Customer Help Index",
    articles: [
      {
        id: "help-index",
        title: "What customers already have answers for in-app",
        body: [
          "Every article below already exists in the dashboard's own Documentation tab (Help → Documentation, sourced from src/lib/docs/content.ts). Check here before writing a fresh support reply — it may already exist, written for the customer, one click away. This is a map, not a copy, so it won't drift out of date on its own.",
          "- Getting Started: Setting up your church; Roles (Owner/Admin/Member); Branches and multi-campus churches; Finding a tab quickly; Changing the language.",
          "- People & Congregation: Managing your congregation (Members); Leaders and Youth; Families; Creating logins for staff and volunteers; Team permissions (Read/Write/Delete).",
          "- Ministry Tools: Ministries, Worship, and Media; Events calendar; To Do (team tasks).",
          "- Tools: Forms; Folder; Attendance; Reports; Widget; Accounting.",
          "- Finance: Fund Raiser, Offering, and Donation; Fund Raiser online giving links.",
          "- Messaging & Social: Email and SMS campaigns; WhatsApp campaigns and chat; Social Media (Instagram, YouTube, Facebook).",
          "- Billing & Plans: Basic, Premium, and Pro; The 14-day trial; Add-on packs; Cancelling a subscription.",
          "- Help & Support: Raising and replying to support tickets.",
        ],
      },
      {
        id: "known-limitations-copy",
        title: "Known limitations (verbatim from the customer-facing docs)",
        body: [
          "- No self-serve mid-cycle plan or billing-interval switching — it's cancel-then-resubscribe for now.",
          "- Cancellation is immediate; there's no \"cancel at period end\" option or partial refund.",
          "- Only Donations (not Offerings) can be linked to a Fund Raiser's total.",
          "- Reports currently covers five tabs (Members, Attendance, Events, Offerings, Donations) — not every module has a report yet.",
          "- Attendance's manual \"check in someone not listed\" search only finds active members — congregants marked pending or left can't be checked in directly.",
          "This list lives in src/lib/docs/content.ts under the \"limitations\" category — update it there first; this is a copy for quick reference during a support conversation.",
        ],
      },
    ],
  },
];
