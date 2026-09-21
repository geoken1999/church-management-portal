-- Facebook Page integration: one connected Page per organization. Same
-- sensitivity model as instagram_connections/youtube_connections —
-- access_token is as sensitive as a password, so this table is admin-only
-- end to end. token_expires_at is nullable because a Page token derived
-- from a long-lived user token typically has no fixed expiry (unlike
-- Instagram's 60-day token or Google's 1-hour token) — Facebook gives no
-- straightforward "refresh" endpoint for it either, so an invalidated
-- token is handled by prompting a reconnect, not a refresh cron.
create table if not exists public.facebook_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  page_id text not null,
  page_name text not null,
  page_picture_url text,
  fan_count integer,
  access_token text not null,
  token_expires_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

drop trigger if exists set_facebook_connections_updated_at on public.facebook_connections;
create trigger set_facebook_connections_updated_at
  before update on public.facebook_connections
  for each row execute function public.set_updated_at();

alter table public.facebook_connections enable row level security;

drop policy if exists "Admins can view their Facebook connection" on public.facebook_connections;
create policy "Admins can view their Facebook connection"
  on public.facebook_connections for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can create their Facebook connection" on public.facebook_connections;
create policy "Admins can create their Facebook connection"
  on public.facebook_connections for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their Facebook connection" on public.facebook_connections;
create policy "Admins can update their Facebook connection"
  on public.facebook_connections for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete their Facebook connection" on public.facebook_connections;
create policy "Admins can delete their Facebook connection"
  on public.facebook_connections for delete to authenticated
  using (public.is_org_admin(organization_id));
