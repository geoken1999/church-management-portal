-- K-meet: video conferencing (like Zoom), embedded via VideoSDK
-- (videosdk.live) rather than built in-house — real-time media
-- infrastructure (WebRTC signaling, SFU, TURN/STUN) isn't something to
-- build from scratch. Credentials (VIDEOSDK_API_KEY/SECRET) are
-- platform-wide env vars, not per-org, matching the Meta WhatsApp
-- integration's shape rather than Instagram/YouTube's per-org OAuth one —
-- every org's meetings run on the same VideoSDK account.
--
-- A meeting's VideoSDK room isn't created until someone actually needs it
-- (an instant meeting creates one immediately; a scheduled meeting
-- creates one lazily, the first time anyone joins) — room_id stays null
-- until then.
create table if not exists public.kmeet_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 1),
  description text,
  -- Optional tie-in to an existing Event (e.g. a Sunday service going
  -- online) — set null if the linked event is later deleted rather than
  -- cascading the meeting away with it.
  event_id uuid references public.events (id) on delete set null,
  -- null means an instant meeting (started immediately, no advance time).
  scheduled_at timestamptz,
  room_id text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists kmeet_meetings_organization_id_idx on public.kmeet_meetings (organization_id, scheduled_at);

drop trigger if exists set_kmeet_meetings_updated_at on public.kmeet_meetings;
create trigger set_kmeet_meetings_updated_at
  before update on public.kmeet_meetings
  for each row execute function public.set_updated_at();

alter table public.kmeet_meetings enable row level security;

-- Same bar as todos/plans (migration 0032) — any org member can read/
-- write at the RLS level, with the finer-grained tab_permissions read/
-- write check enforced by checkTabAccess at the Server Action layer, not
-- duplicated here.
drop policy if exists "Members can view their org's kmeet meetings" on public.kmeet_meetings;
create policy "Members can view their org's kmeet meetings"
  on public.kmeet_meetings for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create kmeet meetings" on public.kmeet_meetings;
create policy "Members can create kmeet meetings"
  on public.kmeet_meetings for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update kmeet meetings" on public.kmeet_meetings;
create policy "Members can update kmeet meetings"
  on public.kmeet_meetings for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can delete kmeet meetings" on public.kmeet_meetings;
create policy "Members can delete kmeet meetings"
  on public.kmeet_meetings for delete to authenticated
  using (public.is_org_member(organization_id));
