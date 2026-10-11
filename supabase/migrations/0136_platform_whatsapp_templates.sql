-- Ready-made WhatsApp templates the platform offers to every church.
-- A row here is the master: it is submitted to WhatsApp once, in the
-- platform's own WhatsApp account, by a platform admin, and once approved
-- it is available to every church sending from the shared KingdomFlow
-- number (copied into their own whatsapp_templates, see
-- src/lib/whatsapp/platform-templates.ts). Service-role only: no policy for
-- any signed-in role.
create table if not exists public.platform_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  -- Stable id from the in-code catalog (src/lib/whatsapp/platform-catalog.ts).
  catalog_key text not null unique,
  name text not null unique check (name ~ '^[a-z0-9_]+$'),
  language text not null default 'en_US',
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  body_text text not null,
  variable_count integer not null default 0,
  meta_template_id text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected', 'paused', 'disabled')),
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_platform_whatsapp_templates_updated_at on public.platform_whatsapp_templates;
create trigger set_platform_whatsapp_templates_updated_at
  before update on public.platform_whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.platform_whatsapp_templates enable row level security;

-- Marks a church's template as a copy of a platform one.
alter table public.whatsapp_templates
  add column if not exists platform_template_id uuid references public.platform_whatsapp_templates (id) on delete set null;

-- Reversal (run manually if needed):
--   alter table public.whatsapp_templates drop column if exists platform_template_id;
--   drop table if exists public.platform_whatsapp_templates;
