-- YouTube integration: one connected channel per organization. Same
-- sensitivity model as instagram_connections — access_token/refresh_token
-- are as sensitive as a password, so this table is admin-only end to end.
-- Unlike Instagram, Google's OAuth model has no equivalent mandatory
-- deauthorize/data-deletion webhook, so there's no SECURITY DEFINER RPC
-- needed here — disconnecting only ever happens through the authenticated
-- admin action, which normal RLS already covers.

create table if not exists public.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id text not null,
  channel_title text not null,
  thumbnail_url text,
  subscriber_count bigint,
  video_count integer,
  view_count bigint,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists youtube_connections_token_expires_at_idx
  on public.youtube_connections (token_expires_at);

drop trigger if exists set_youtube_connections_updated_at on public.youtube_connections;
create trigger set_youtube_connections_updated_at
  before update on public.youtube_connections
  for each row execute function public.set_updated_at();

alter table public.youtube_connections enable row level security;

drop policy if exists "Admins can view their YouTube connection" on public.youtube_connections;
create policy "Admins can view their YouTube connection"
  on public.youtube_connections for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can create their YouTube connection" on public.youtube_connections;
create policy "Admins can create their YouTube connection"
  on public.youtube_connections for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their YouTube connection" on public.youtube_connections;
create policy "Admins can update their YouTube connection"
  on public.youtube_connections for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete their YouTube connection" on public.youtube_connections;
create policy "Admins can delete their YouTube connection"
  on public.youtube_connections for delete to authenticated
  using (public.is_org_admin(organization_id));
