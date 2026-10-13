-- Live streams: a church broadcasts from a K-Connect room (VideoSDK HLS) and members
-- watch inside the app. Each stream is tied to the K-Connect video room it is
-- broadcast from. Members never read these tables directly: the mobile API checks
-- their session and returns only what they may see (stream keys stay with the team).
create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meeting_id uuid not null unique references public.kmeet_meetings (id) on delete cascade,
  title text not null check (length(trim(title)) >= 1),
  description text,
  -- ready: set up, not broadcasting yet; live: broadcasting now; ended: finished.
  status text not null default 'ready' check (status in ('ready', 'live', 'ended')),
  -- How the broadcast looks (VideoSDK HLS config).
  layout text not null default 'GRID' check (layout in ('GRID', 'SPOTLIGHT', 'SIDEBAR')),
  layout_priority text not null default 'SPEAKER' check (layout_priority in ('SPEAKER', 'PIN')),
  orientation text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  theme text not null default 'DARK' check (theme in ('DARK', 'LIGHT', 'DEFAULT')),
  quality text not null default 'high' check (quality in ('low', 'med', 'high')),
  audio_only boolean not null default false,
  record boolean not null default false,
  -- Also send the broadcast to YouTube, Facebook etc: [{ "name", "url", "streamKey" }].
  rtmp_outputs jsonb not null default '[]'::jsonb,
  notify_members boolean not null default true,
  chat_enabled boolean not null default true,
  playback_url text,
  started_at timestamptz,
  ended_at timestamptz,
  peak_viewers integer not null default 0,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_streams_org_idx on public.live_streams (organization_id, created_at desc);
create index if not exists live_streams_live_idx on public.live_streams (organization_id) where status = 'live';

drop trigger if exists set_live_streams_updated_at on public.live_streams;
create trigger set_live_streams_updated_at
  before update on public.live_streams
  for each row execute function public.set_updated_at();

alter table public.live_streams enable row level security;

drop policy if exists "Team can view their church's live streams" on public.live_streams;
create policy "Team can view their church's live streams"
  on public.live_streams for select to authenticated
  using (public.is_org_member(organization_id));

-- Who is watching: a viewer reports in every few seconds; seen in the last 30 seconds counts.
create table if not exists public.live_stream_viewers (
  stream_id uuid not null references public.live_streams (id) on delete cascade,
  viewer_id text not null,
  last_seen timestamptz not null default now(),
  primary key (stream_id, viewer_id)
);
alter table public.live_stream_viewers enable row level security;

-- The stream's chat.
create table if not exists public.live_stream_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_name text not null,
  author_kind text not null default 'member' check (author_kind in ('member', 'host')),
  body text not null check (length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists live_stream_messages_stream_idx on public.live_stream_messages (stream_id, created_at);
alter table public.live_stream_messages enable row level security;

drop policy if exists "Team can read their church's live chat" on public.live_stream_messages;
create policy "Team can read their church's live chat"
  on public.live_stream_messages for select to authenticated
  using (public.is_org_member(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.live_stream_messages, public.live_stream_viewers, public.live_streams;
