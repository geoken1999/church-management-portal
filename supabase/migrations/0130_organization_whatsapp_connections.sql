-- A tenant's own WhatsApp Business number. Until an organization connects
-- one, every WhatsApp send and the inbox use the platform's shared number
-- (env vars, migration 0097); once a row here is 'active', that
-- organization's sends, templates and inbound routing use its own number.
--
-- access_token_encrypted / app_secret_encrypted are AES-256-GCM values
-- (src/lib/whatsapp/secret-box.ts). This table has RLS on and NO policy for
-- any signed-in role: it is read and written only by server code on the
-- service-role client, so a token can never be fetched from the browser.
create table if not exists public.organization_whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  connection_method text not null check (connection_method in ('manual', 'embedded_signup')),
  waba_id text not null,
  -- One Meta phone number belongs to one organization; also how an inbound
  -- webhook is routed to its organization.
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  access_token_encrypted text not null,
  -- Only when the tenant sends webhooks from their own Meta app (manual
  -- mode); embedded signup uses the platform app's secret.
  app_secret_encrypted text,
  -- Shared secret for the tenant's own webhook subscription handshake.
  webhook_verify_token text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error text,
  last_checked_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_whatsapp_connections_waba_idx on public.organization_whatsapp_connections (waba_id);

drop trigger if exists set_organization_whatsapp_connections_updated_at on public.organization_whatsapp_connections;
create trigger set_organization_whatsapp_connections_updated_at
  before update on public.organization_whatsapp_connections
  for each row execute function public.set_updated_at();

alter table public.organization_whatsapp_connections enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.organization_whatsapp_connections;
