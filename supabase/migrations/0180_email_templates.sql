-- A church's own saved email templates: a name, a subject and a message to start a campaign from.
-- (Ready-made templates ship with the app itself and are not stored here.)
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  subject text not null default '',
  body_html text not null default '',
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists email_templates_org_idx on public.email_templates (organization_id, name);

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;

drop policy if exists "Team can view their church's email templates" on public.email_templates;
create policy "Team can view their church's email templates"
  on public.email_templates for select to authenticated
  using (public.is_org_member(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.email_templates;
