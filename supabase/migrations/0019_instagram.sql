-- Instagram integration: one connected Instagram professional account per
-- organization. access_token is a long-lived Instagram user token (~60
-- days, refreshed by a cron job before it expires) — it's as sensitive as a
-- password, so this whole table is admin-only, both to read and to manage.
-- There is no anon/authenticated-non-admin access at all, unlike every
-- other module in this app (which lets any org member at least view).

create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  account_type text,
  profile_picture_url text,
  media_count integer,
  followers_count integer,
  access_token text not null,
  token_expires_at timestamptz not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists instagram_connections_token_expires_at_idx
  on public.instagram_connections (token_expires_at);

drop trigger if exists set_instagram_connections_updated_at on public.instagram_connections;
create trigger set_instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.set_updated_at();

alter table public.instagram_connections enable row level security;

drop policy if exists "Admins can view their Instagram connection" on public.instagram_connections;
create policy "Admins can view their Instagram connection"
  on public.instagram_connections for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can create their Instagram connection" on public.instagram_connections;
create policy "Admins can create their Instagram connection"
  on public.instagram_connections for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their Instagram connection" on public.instagram_connections;
create policy "Admins can update their Instagram connection"
  on public.instagram_connections for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete their Instagram connection" on public.instagram_connections;
create policy "Admins can delete their Instagram connection"
  on public.instagram_connections for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Meta's deauthorize and data-deletion webhooks call this server-to-server,
-- with no Supabase session at all — RLS above would silently no-op a plain
-- delete from that context. The app verifies the request's HMAC signature
-- (using the Meta app secret) before ever calling this, so granting it to
-- anon doesn't weaken anything: the real authorization check already
-- happened before this function is reached, same pattern as
-- submit_member_request().
create or replace function public.delete_instagram_connection_by_ig_user(ig_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.instagram_connections where instagram_user_id = ig_user_id;
end;
$$;

grant execute on function public.delete_instagram_connection_by_ig_user(text) to anon, authenticated;
