-- 1. Members (phone login) can receive push notifications.
--    device_push_tokens and notification_preferences pointed at profiles, which
--    only email (staff) accounts have (0121 skips phone-only sign-ins), so a
--    member's device token could never be saved. Point them at auth.users
--    instead; every profile's auth_user_id is an auth.users id, so existing
--    rows stay valid.
alter table public.device_push_tokens drop constraint if exists device_push_tokens_auth_user_id_fkey;
alter table public.device_push_tokens
  add constraint device_push_tokens_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete cascade;

alter table public.notification_preferences drop constraint if exists notification_preferences_auth_user_id_fkey;
alter table public.notification_preferences
  add constraint notification_preferences_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete cascade;

-- New categories (default on, like the others).
alter table public.notification_preferences
  add column if not exists church_announcement boolean not null default true,
  add column if not exists group_post boolean not null default true,
  add column if not exists special_day boolean not null default true;

-- 2. Notifications an admin sends by hand: to the whole church, one group, or
--    one member. Kept as a history on the web side only.
create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  audience text not null check (audience in ('church', 'group', 'member')),
  group_key text check (group_key is null or group_key in ('leaders', 'youth', 'worship', 'media', 'committee')),
  member_id uuid references public.members (id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 60),
  body text not null check (length(trim(body)) between 2 and 240),
  recipient_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists push_broadcasts_org_idx on public.push_broadcasts (organization_id, created_at desc);

alter table public.push_broadcasts enable row level security;

drop policy if exists "Org members can view push broadcasts" on public.push_broadcasts;
create policy "Org members can view push broadcasts"
  on public.push_broadcasts for select to authenticated
  using (public.is_org_member(organization_id));

-- 3. Special days (birthday, wedding anniversary): one push per member, per
--    kind, per year, so a re-run of the daily job never sends twice.
create table if not exists public.special_day_pushes (
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary')),
  year integer not null,
  sent_at timestamptz not null default now(),
  primary key (member_id, kind, year)
);

alter table public.special_day_pushes enable row level security;
-- No policies: only the server (service role) reads or writes it.

-- 4. A member's event registrations (matched by the email or phone they
--    registered with), so the app can show their boarding pass QR.
create or replace function public.get_my_event_passes(target_org_id uuid)
returns table (
  registration_id uuid,
  event_title text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  venue text,
  confirmation_code text,
  status text,
  pass_token uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, e.title, e.start_at, e.end_at, e.venue, r.confirmation_code, r.status, r.pass_token
  from public.members m
  join public.event_registrations r on r.organization_id = m.organization_id
  join public.events e on e.id = r.event_id
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and r.status in ('confirmed', 'checked_in')
    and e.status in ('pending', 'active', 'completed')
    and coalesce(e.end_at, e.start_at) > now() - interval '2 days'
    and (
      (m.email is not null and lower(r.email) = lower(m.email))
      or (
        m.phone is not null and r.phone is not null
        and length(regexp_replace(m.phone, '\D', '', 'g')) >= 10
        and right(regexp_replace(m.phone, '\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\D', '', 'g'), 10)
      )
    )
  order by e.start_at asc
  limit 20;
$$;

grant execute on function public.get_my_event_passes(uuid) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.get_my_event_passes(uuid);
--   drop table if exists public.special_day_pushes;
--   drop table if exists public.push_broadcasts;
--   alter table public.notification_preferences drop column if exists church_announcement, drop column if exists group_post, drop column if exists special_day;
