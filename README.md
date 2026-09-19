# KingdomFlow

A multi-tenant church management SaaS, built module by module. This codebase currently
implements **Module 01 — User Management & Authentication**, extended with the **Organization
onboarding** flow (originally planned as Module 02) so the app is multi-tenant from the start:
signup, login, an organization per tenant, invitations, and a protected dashboard placeholder.

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Auth + Postgres) · Tailwind CSS v4 · shadcn/ui

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (or use an existing one).
2. **Environment variables** — copy `.env.example` to `.env.local` and fill in the values from
   your Supabase project's **Settings → API** page:

   ```bash
   cp .env.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

3. **Run the database migrations, in order** — open the Supabase SQL editor and run:
   1. `supabase/migrations/0001_create_profiles.sql` — the `profiles` table, RLS (a user can
      only read/update their own profile), and a trigger that auto-creates a profile on signup.
   2. `supabase/migrations/0002_organizations.sql` — `organizations`, `organization_members`,
      `organization_invitations`, the RLS/helper-function pattern that scopes everything by
      tenant, and the `create_organization` / `accept_invitation` RPCs.
4. **Install dependencies and run the dev server:**

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Multi-tenant architecture

Every row of tenant data hangs off an **organization** (the tenant boundary). A user can belong
to more than one organization via `organization_members`, with a `role` of `owner`, `admin`, or
`member`. `profiles.active_organization_id` tracks which one they're currently working in.

- **Row Level Security is the tenant boundary**, not application code. `organizations`,
  `organization_members`, and `organization_invitations` all filter by membership using
  `SECURITY DEFINER` helper functions (`is_org_member`, `is_org_admin`) declared in
  `0002_organizations.sql` — these avoid the classic recursive-RLS trap of a policy on a table
  needing to query that same table.
- **Organizations and memberships are never inserted directly from the client.** They're created
  exclusively through the `create_organization()` and `accept_invitation()` Postgres functions,
  so an organization can never exist without an owner.
- **Adding tenant-scoped data in a future module** (members, ministries, events, giving, …) means
  giving the new table an `organization_id` column and an RLS policy built on `is_org_member()` /
  `is_org_admin()` — the same pattern already in place.

## Flow

```
Signup → (confirm email, if enabled) → Onboarding → Dashboard
                                           │
                                           ├─ pending invite? → Accept → joins that organization
                                           └─ no invite → Create organization (becomes owner)
```

- Public: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`,
  `/invite/[token]`. Protected (requires a session): `/dashboard/*`, `/onboarding`.
- `/dashboard` redirects to `/onboarding` if the user has no organization yet; `/onboarding`
  redirects to `/dashboard` once they do — so a user always lands in the right place regardless
  of how they arrive.
- Session checks run in `src/proxy.ts` (Next 16's renamed middleware) on every request, and
  again in `src/lib/auth/dal.ts` / `src/lib/organizations/dal.ts` on the pages themselves — never
  rely on the proxy check alone for security.
- `src/app/auth/callback/route.ts` completes both email confirmation and password-reset redirects,
  and forwards an optional `next` param (used so an invite link survives a signup detour).
- Team management on the dashboard (invite by email, revoke invite, remove member) is
  intentionally minimal — no email delivery is wired up yet, so a real invite currently has no
  email sent; only the DB row and the shareable `/invite/[token]` link exist.

## What's not in this module

Roles/permissions beyond owner/admin/member, church members, ministries, groups, events,
attendance, giving, and everything else in the KingdomFlow roadmap. Only the auth + tenant
foundation is here.
# church-management
# church-management-portal
# church-management-portal
