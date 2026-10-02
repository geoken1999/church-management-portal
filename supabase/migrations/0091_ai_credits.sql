-- AI credits: a monthly quota per plan (set in src/lib/plans/config.ts),
-- plus a persistent add-on balance on top of it, following the exact same
-- shape as the existing sms/email/whatsapp addon columns.
alter table public.organizations
  add column if not exists addon_ai_credits integer not null default 0;

-- One row per AI-generated reply actually sent (not attempted) — usage is
-- counted by querying this table for the current month, the same approach
-- already used for sms_campaigns/email_campaigns, rather than a
-- decrementing counter. Written only by the Instagram webhook (via the
-- admin client — a webhook request carries no user session for
-- is_org_member() to evaluate), so there is no insert/update/delete policy
-- for authenticated users, only select.
create table if not exists public.ai_reply_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  participant_id text,
  created_at timestamptz not null default now()
);

create index if not exists ai_reply_usage_org_created_idx on public.ai_reply_usage (organization_id, created_at);

alter table public.ai_reply_usage enable row level security;

drop policy if exists "Members can view their org's ai reply usage" on public.ai_reply_usage;
create policy "Members can view their org's ai reply usage"
  on public.ai_reply_usage for select to authenticated
  using (public.is_org_member(organization_id));
