-- Bulk SMS via a single app-wide Twilio account (shared-only, no
-- per-org "bring your own Twilio" — unlike email, which supports both).
-- This table is purely a send-history log, same shape as email_campaigns.
create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  body text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  failed_recipients jsonb not null default '[]'::jsonb,
  status text not null check (status in ('sent', 'partial_failure', 'failed')),
  sent_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sms_campaigns_organization_id_created_at_idx
  on public.sms_campaigns (organization_id, created_at desc);

alter table public.sms_campaigns enable row level security;

drop policy if exists "Members can view their org's sms campaigns" on public.sms_campaigns;
create policy "Members can view their org's sms campaigns"
  on public.sms_campaigns for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record sent sms campaigns" on public.sms_campaigns;
create policy "Admins can record sent sms campaigns"
  on public.sms_campaigns for insert to authenticated
  with check (public.is_org_admin(organization_id));
