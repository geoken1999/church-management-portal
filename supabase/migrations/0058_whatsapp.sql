-- WhatsApp messaging: campaigns (bulk, one-way) and a two-way chat inbox.
-- Two send modes, chosen per organization:
--   - 'shared': the platform's own Twilio WhatsApp sender (TWILIO_ACCOUNT_SID/
--     AUTH_TOKEN — same account already used for SMS — plus a new
--     TWILIO_WHATSAPP_FROM_NUMBER), metered by plan quota. Campaigns only —
--     see below for why.
--   - 'own': the church's own Twilio account/WhatsApp-enabled number,
--     credentials stored in organization_whatsapp_accounts. Unmetered
--     (it's their own Twilio bill), same sensitivity model as
--     organization_razorpay_accounts (admin-only end to end).
--
-- Two-way chat (whatsapp_conversations/whatsapp_messages) is 'own'-mode
-- only. A single shared number serving many churches has no reliable way
-- to know which church an inbound reply belongs to — unlike a payment
-- link (which carries org context in the URL) or an outbound campaign, an
-- inbound WhatsApp message only carries a phone number, and the same
-- person could plausibly text the one shared number on behalf of two
-- different churches on the platform. A church's own dedicated number has
-- no such ambiguity, so chat is gated to 'own' mode at the app layer.

create table if not exists public.organization_whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  account_sid text not null,
  auth_token text not null,
  whatsapp_number text not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

drop trigger if exists set_organization_whatsapp_accounts_updated_at on public.organization_whatsapp_accounts;
create trigger set_organization_whatsapp_accounts_updated_at
  before update on public.organization_whatsapp_accounts
  for each row execute function public.set_updated_at();

alter table public.organization_whatsapp_accounts enable row level security;

drop policy if exists "Admins can view their WhatsApp account" on public.organization_whatsapp_accounts;
create policy "Admins can view their WhatsApp account"
  on public.organization_whatsapp_accounts for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can connect their WhatsApp account" on public.organization_whatsapp_accounts;
create policy "Admins can connect their WhatsApp account"
  on public.organization_whatsapp_accounts for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their WhatsApp account" on public.organization_whatsapp_accounts;
create policy "Admins can update their WhatsApp account"
  on public.organization_whatsapp_accounts for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove their WhatsApp account" on public.organization_whatsapp_accounts;
create policy "Admins can remove their WhatsApp account"
  on public.organization_whatsapp_accounts for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Bulk send history — same shape as sms_campaigns (migration 0034), plus
-- `mode` so quota accounting (plans/dal.ts) can count only 'shared' sends,
-- the same way email_campaigns.provider already distinguishes shared vs
-- per-org SMTP.
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mode text not null check (mode in ('own', 'shared')),
  body text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  failed_recipients jsonb not null default '[]'::jsonb,
  status text not null check (status in ('sent', 'partial_failure', 'failed')),
  sent_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_campaigns_organization_id_created_at_idx
  on public.whatsapp_campaigns (organization_id, created_at desc);

alter table public.whatsapp_campaigns enable row level security;

drop policy if exists "Members can view their org's whatsapp campaigns" on public.whatsapp_campaigns;
create policy "Members can view their org's whatsapp campaigns"
  on public.whatsapp_campaigns for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record sent whatsapp campaigns" on public.whatsapp_campaigns;
create policy "Admins can record sent whatsapp campaigns"
  on public.whatsapp_campaigns for insert to authenticated
  with check (public.is_org_admin(organization_id));

-- One conversation per (org, phone number) — 'own' mode only in practice
-- (enforced in the app layer, not here), created on first inbound or
-- outbound message with that number.
create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone_number text not null,
  member_id uuid references public.members (id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_number)
);

create index if not exists whatsapp_conversations_organization_id_idx on public.whatsapp_conversations (organization_id, last_message_at desc);

drop trigger if exists set_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger set_whatsapp_conversations_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  twilio_sid text,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_id_idx on public.whatsapp_messages (conversation_id, created_at);
create index if not exists whatsapp_messages_organization_id_idx on public.whatsapp_messages (organization_id);

-- Belt-and-braces, same pattern used throughout this app: a message's
-- organization_id must match its parent conversation's.
create or replace function public.check_whatsapp_message_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.whatsapp_conversations c where c.id = new.conversation_id and c.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the parent conversation''s organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_whatsapp_message_org on public.whatsapp_messages;
create trigger check_whatsapp_message_org
  before insert or update of conversation_id, organization_id on public.whatsapp_messages
  for each row execute function public.check_whatsapp_message_org();

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Both tables: any org member can view/manage (day-to-day chat work),
-- same shape as members/events rather than the admin-only floor used for
-- money-adjacent tables — replying to a congregant's query isn't a
-- sensitive action the way connecting a Twilio account is.
drop policy if exists "Org members can view whatsapp conversations" on public.whatsapp_conversations;
create policy "Org members can view whatsapp conversations"
  on public.whatsapp_conversations for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can manage whatsapp conversations" on public.whatsapp_conversations;
create policy "Org members can manage whatsapp conversations"
  on public.whatsapp_conversations for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Org members can view whatsapp messages" on public.whatsapp_messages;
create policy "Org members can view whatsapp messages"
  on public.whatsapp_messages for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can send whatsapp messages" on public.whatsapp_messages;
create policy "Org members can send whatsapp messages"
  on public.whatsapp_messages for insert to authenticated
  with check (public.is_org_member(organization_id));
