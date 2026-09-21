-- Lets an org bring its own SMTP server instead of the shared Resend
-- account in email_campaigns/0026 — same sensitivity model as
-- instagram_connections/youtube_connections/facebook_connections
-- (password is as sensitive as those access_tokens), so this is
-- admin-only end to end, one config per org.
create table if not exists public.email_smtp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  host text not null,
  port integer not null,
  secure boolean not null default false,
  username text not null,
  password text not null,
  from_email text not null,
  from_name text,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_email_smtp_settings_updated_at on public.email_smtp_settings;
create trigger set_email_smtp_settings_updated_at
  before update on public.email_smtp_settings
  for each row execute function public.set_updated_at();

alter table public.email_smtp_settings enable row level security;

drop policy if exists "Admins can view their SMTP settings" on public.email_smtp_settings;
create policy "Admins can view their SMTP settings"
  on public.email_smtp_settings for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can create their SMTP settings" on public.email_smtp_settings;
create policy "Admins can create their SMTP settings"
  on public.email_smtp_settings for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their SMTP settings" on public.email_smtp_settings;
create policy "Admins can update their SMTP settings"
  on public.email_smtp_settings for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete their SMTP settings" on public.email_smtp_settings;
create policy "Admins can delete their SMTP settings"
  on public.email_smtp_settings for delete to authenticated
  using (public.is_org_admin(organization_id));
