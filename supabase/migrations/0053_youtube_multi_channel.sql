-- Multiple YouTube channels per organization, one of which is "active" at
-- a time — every existing call site (getYouTubeConnection, token refresh,
-- video/comment/broadcast actions) keeps working unchanged because it
-- already only ever dealt with "the" connection; that now just means "the
-- active one" instead of "the only one". Switching channels flips which
-- row has is_active = true rather than deleting/reconnecting anything.

alter table public.youtube_connections
  add column if not exists is_active boolean not null default true;

-- The old table only ever allowed one row per org — that constraint is
-- what a second connect used to upsert-overwrite. Replaced by a per-org
-- uniqueness on (organization_id, channel_id), so reconnecting the SAME
-- channel still updates its row in place, but a DIFFERENT channel_id adds
-- a new one instead of clobbering it.
alter table public.youtube_connections
  drop constraint if exists youtube_connections_organization_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'youtube_connections_organization_id_channel_id_key'
  ) then
    alter table public.youtube_connections
      add constraint youtube_connections_organization_id_channel_id_key unique (organization_id, channel_id);
  end if;
end $$;

-- At most one active channel per org at a time (existing rows all default
-- to is_active = true, and there's currently only ever one row per org, so
-- this is satisfied immediately without a backfill).
create unique index if not exists youtube_connections_one_active_per_org
  on public.youtube_connections (organization_id)
  where is_active;
