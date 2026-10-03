-- Switches WhatsApp from Twilio to Meta's WhatsApp Cloud API, used
-- directly (no BSP in between) through one platform-wide WhatsApp
-- Business number shared by every org (credentials live in env vars —
-- META_WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/BUSINESS_ACCOUNT_ID/APP_SECRET/
-- WEBHOOK_VERIFY_TOKEN — not per-org, so there's no new connection table).
--
-- organization_whatsapp_accounts (migration 0058) is left in place but
-- unused going forward — it stored per-org Twilio credentials for the old
-- "own number" mode, which no longer exists. Not dropped, since dropping a
-- table is destructive and nothing reads it once the code stops querying
-- it.

-- Templates: Meta requires a pre-approved message template for any
-- business-initiated message (anything outside the 24-hour customer
-- service window). Each org creates its own template requests, submitted
-- to Meta against the one shared WABA — write access is admin-only
-- because a bad template affects the shared number's quality rating for
-- every org on the platform, the same bar as connecting/disconnecting a
-- social account elsewhere in this app.
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]+$'),
  language text not null default 'en_US',
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  body_text text not null check (length(trim(body_text)) >= 1),
  variable_count integer not null default 0,
  meta_template_id text,
  -- Meta's own statuses (APPROVED/PENDING_REVIEW/REJECTED/PAUSED/DISABLED)
  -- lowercased and mapped 1:1, plus 'draft' for a row that failed to reach
  -- Meta at all (create call errored before an id came back).
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected', 'paused', 'disabled')),
  rejected_reason text,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists whatsapp_templates_organization_id_idx on public.whatsapp_templates (organization_id);

drop trigger if exists set_whatsapp_templates_updated_at on public.whatsapp_templates;
create trigger set_whatsapp_templates_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;

drop policy if exists "Members can view their org's whatsapp templates" on public.whatsapp_templates;
create policy "Members can view their org's whatsapp templates"
  on public.whatsapp_templates for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create whatsapp templates" on public.whatsapp_templates;
create policy "Admins can create whatsapp templates"
  on public.whatsapp_templates for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update whatsapp templates" on public.whatsapp_templates;
create policy "Admins can update whatsapp templates"
  on public.whatsapp_templates for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete whatsapp templates" on public.whatsapp_templates;
create policy "Admins can delete whatsapp templates"
  on public.whatsapp_templates for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Campaigns now reference the template actually sent (for provenance) —
-- 'mode' (own/shared) no longer means anything since there's only one
-- send path, so it's just left nullable rather than renamed/dropped.
-- `body` keeps storing the fully-rendered text that was actually sent
-- (template body with {{n}} filled in), same meaning as before.
alter table public.whatsapp_campaigns
  alter column mode drop not null;

alter table public.whatsapp_campaigns
  add column if not exists template_id uuid references public.whatsapp_templates (id) on delete set null,
  add column if not exists template_variables jsonb not null default '[]'::jsonb;
