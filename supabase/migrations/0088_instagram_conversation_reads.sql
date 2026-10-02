-- Instagram's Conversations API (for the "Instagram API with Instagram
-- Login" product this app uses) exposes no read/unread field at all —
-- confirmed empirically: requesting unread_count, can_reply, etc. on this
-- node silently returns nothing rather than erroring, same as requesting a
-- made-up field name, meaning they're simply unsupported here. This table
-- tracks the team's own "last viewed" state per conversation instead,
-- since Instagram won't tell us. Shared across the whole org (a team
-- inbox), not per-user — any staff member opening a conversation marks it
-- read for everyone, matching how the Instagram tab itself is shared org
-- content.
create table if not exists public.instagram_conversation_reads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Instagram's own conversation id (not a local uuid) — there's no
  -- foreign key to instagram_connections because conversations themselves
  -- are never stored locally, only fetched live from the Graph API.
  conversation_id text not null,
  last_read_at timestamptz not null default now(),
  unique (organization_id, conversation_id)
);

create index if not exists instagram_conversation_reads_org_idx on public.instagram_conversation_reads (organization_id);

alter table public.instagram_conversation_reads enable row level security;

-- Same "any org member can fully manage" shape as plans (migration 0086).
drop policy if exists "Members can view their org's instagram read state" on public.instagram_conversation_reads;
create policy "Members can view their org's instagram read state"
  on public.instagram_conversation_reads for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can upsert instagram read state" on public.instagram_conversation_reads;
create policy "Members can upsert instagram read state"
  on public.instagram_conversation_reads for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update instagram read state" on public.instagram_conversation_reads;
create policy "Members can update instagram read state"
  on public.instagram_conversation_reads for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
