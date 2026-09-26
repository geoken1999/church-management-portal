-- Per-message delivery status across every outbound channel (SMS,
-- WhatsApp, Email). Until now, the app only ever saw whether a provider
-- ACCEPTED a send (client.messages.create() resolving, or Resend's send
-- call succeeding) — actual delivery/failure happens asynchronously on
-- the provider's side and was invisible to this app entirely (see the
-- WhatsApp errors 63051/63015 debugged live in chat, both of which showed
-- "sent" in our own sms_campaigns/whatsapp_campaigns tables despite
-- failing). This table is what the new provider webhooks
-- (src/app/api/twilio/status-callback, src/app/api/resend/webhook)
-- upsert into, keyed by the provider's own message/email id so repeated
-- status updates for the same message (queued -> sent -> delivered, or
-- -> failed) land on one row.
create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  provider_id text not null,
  recipient text,
  status text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_delivery_events_channel_provider_id_key
  on public.message_delivery_events (channel, provider_id);
create index if not exists message_delivery_events_organization_id_idx
  on public.message_delivery_events (organization_id);
create index if not exists message_delivery_events_status_idx
  on public.message_delivery_events (status);

drop trigger if exists set_message_delivery_events_updated_at on public.message_delivery_events;
create trigger set_message_delivery_events_updated_at
  before update on public.message_delivery_events
  for each row execute function public.set_updated_at();

-- Purely an operational/debugging record, same lockdown as platform_events
-- (migration 0063) — only the service-role client (the webhook routes and
-- the platform-admin dal) ever reads or writes this, so there's no
-- authenticated-role policy at all.
alter table public.message_delivery_events enable row level security;
