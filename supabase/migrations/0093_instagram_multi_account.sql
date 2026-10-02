-- Multiple Instagram accounts per organization, one of which is "active"
-- at a time — mirrors youtube_connections' own multi-channel migration
-- (0053) exactly, same reasoning: every existing call site
-- (getInstagramConnection, token refresh, posts/messages/insights actions)
-- keeps working unchanged because it already only ever dealt with "the"
-- connection; that now just means "the active one" instead of "the only
-- one". Switching accounts flips which row has is_active = true rather
-- than deleting/reconnecting anything.

alter table public.instagram_connections
  add column if not exists is_active boolean not null default true;

-- The old table only ever allowed one row per org — that constraint is
-- what a second connect used to upsert-overwrite. Replaced by a per-org
-- uniqueness on (organization_id, instagram_user_id), so reconnecting the
-- SAME account still updates its row in place, but a DIFFERENT account
-- adds a new one instead of clobbering it.
alter table public.instagram_connections
  drop constraint if exists instagram_connections_organization_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'instagram_connections_organization_id_instagram_user_id_key'
  ) then
    alter table public.instagram_connections
      add constraint instagram_connections_organization_id_instagram_user_id_key unique (organization_id, instagram_user_id);
  end if;
end $$;

-- At most one active account per org at a time (existing rows all default
-- to is_active = true, and there's currently only ever one row per org, so
-- this is satisfied immediately without a backfill).
create unique index if not exists instagram_connections_one_active_per_org
  on public.instagram_connections (organization_id)
  where is_active;

-- instagram_connections_messaging_user_id_idx (migration 0089) is already
-- a plain unique index on messaging_user_id alone, not scoped to
-- organization_id — it already allows multiple rows per org as long as
-- each has its own distinct messaging_user_id (always true for different
-- real accounts), so nothing needs to change there.
