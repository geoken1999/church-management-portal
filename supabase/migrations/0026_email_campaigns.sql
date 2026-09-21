-- Bulk email (newsletters / announcements) sent via a single app-wide
-- provider (Resend) rather than a per-org OAuth connection like
-- Instagram/YouTube/Facebook — there's no "connect" step, just an
-- RESEND_API_KEY env var, so this table is purely a send-history log.
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject text not null,
  body_html text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  failed_recipients jsonb not null default '[]'::jsonb,
  status text not null check (status in ('sent', 'partial_failure', 'failed')),
  -- References profiles.auth_user_id (not auth.users.id directly) so
  -- PostgREST can embed the sender's name — same pattern as
  -- organization_members.auth_user_id -> profiles.auth_user_id.
  sent_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists email_campaigns_organization_id_created_at_idx
  on public.email_campaigns (organization_id, created_at desc);

alter table public.email_campaigns enable row level security;

-- Read is open to every org member (transparency on what's gone out to the
-- congregation); only admins can send, matching every other bulk/sensitive
-- action in the app (bulk member import, disconnecting integrations, etc).
drop policy if exists "Members can view their org's email campaigns" on public.email_campaigns;
create policy "Members can view their org's email campaigns"
  on public.email_campaigns for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record sent email campaigns" on public.email_campaigns;
create policy "Admins can record sent email campaigns"
  on public.email_campaigns for insert to authenticated
  with check (public.is_org_admin(organization_id));
