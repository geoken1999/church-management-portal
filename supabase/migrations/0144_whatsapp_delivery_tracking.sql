-- Delivery tracking for outbound WhatsApp template messages.
--
-- Until now a campaign, a birthday message or an event pass only recorded
-- that WhatsApp ACCEPTED the send; whether it was later delivered (or held
-- back, e.g. error 131049 "to maintain healthy ecosystem engagement") came
-- back by webhook and could not be tied to a church, campaign or run. This
-- keeps one row per message, keyed by WhatsApp's message id, so a delivery
-- failure can be traced and acted on.
create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('campaign', 'automation', 'event_pass')),
  -- whatsapp_campaigns.id for a campaign, automation_executions.id for an
  -- automation; null for passes.
  ref_id uuid,
  recipient text not null,
  wamid text not null unique,
  template_name text,
  category text,
  -- The business number it went out from (a church's own or the shared one):
  -- whether a person can be reached is a property of that sender.
  sender_key text not null,
  status text not null default 'sent',
  error_code text,
  -- Set once a failed delivery has been taken off the church's monthly
  -- WhatsApp count, so a repeated status callback can't do it twice.
  credited_back boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_message_log_org_created_idx on public.whatsapp_message_log (organization_id, created_at desc);
create index if not exists whatsapp_message_log_ref_idx on public.whatsapp_message_log (ref_id) where ref_id is not null;

drop trigger if exists set_whatsapp_message_log_updated_at on public.whatsapp_message_log;
create trigger set_whatsapp_message_log_updated_at
  before update on public.whatsapp_message_log
  for each row execute function public.set_updated_at();

-- A church can see its own delivery log; writes are service-role only.
alter table public.whatsapp_message_log enable row level security;

drop policy if exists "Org members can view their whatsapp message log" on public.whatsapp_message_log;
create policy "Org members can view their whatsapp message log"
  on public.whatsapp_message_log for select to authenticated
  using (public.is_org_member(organization_id));

-- Which people WhatsApp is currently holding marketing messages back from,
-- per sending number. A 131049 means "not delivered to maintain healthy
-- ecosystem engagement": retrying straight away fails the same way and only
-- hurts the sender's quality, so marketing sends skip the person until
-- marketing_blocked_until, which grows with each repeat. Cleared by a
-- delivery, a read, or the person messaging us. Service-role only.
create table if not exists public.whatsapp_contact_health (
  sender_key text not null,
  recipient text not null,
  marketing_blocked_until timestamptz,
  consecutive_failures integer not null default 0,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (sender_key, recipient)
);

alter table public.whatsapp_contact_health enable row level security;

-- Campaigns record who was skipped for that reason, apart from who failed.
alter table public.whatsapp_campaigns
  add column if not exists skipped_count integer not null default 0,
  add column if not exists skipped_recipients jsonb not null default '[]'::jsonb;

-- Reversal (run manually if needed):
--   alter table public.whatsapp_campaigns drop column if exists skipped_count, drop column if exists skipped_recipients;
--   drop table if exists public.whatsapp_contact_health;
--   drop table if exists public.whatsapp_message_log;
