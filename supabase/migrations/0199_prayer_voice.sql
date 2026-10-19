-- Voice prayer requests. A member can record a short voice message (up to 90 seconds) instead of, or as
-- well as, writing a request. The recording is kept in a private bucket and only played through a short
-- link the server hands out after checking who is asking: the member themself, the church team, or other
-- members when the request is shared on the prayer wall.

alter table public.prayer_requests add column if not exists audio_path text;
alter table public.prayer_requests add column if not exists audio_seconds integer
  check (audio_seconds is null or audio_seconds between 1 and 120);

-- A request needs words, a recording, or both.
alter table public.prayer_requests drop constraint if exists prayer_requests_request_check;
alter table public.prayer_requests add constraint prayer_requests_request_check check (
  length(trim(request)) <= 1000
  and (length(trim(request)) >= 3 or audio_path is not null)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prayer-audio', 'prayer-audio', false, 3145728,
  array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No storage policies: the bucket is private and only the server (service role) reads and writes it.

-- The prayer wall now says which requests have a voice message (the recording itself is fetched through
-- the server).
drop function if exists public.get_prayer_wall(uuid);
create or replace function public.get_prayer_wall(target_org_id uuid)
returns table (
  id uuid,
  request text,
  author_name text,
  is_mine boolean,
  status text,
  created_at timestamptz,
  answered_at timestamptz,
  has_audio boolean,
  audio_seconds integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.request,
    case when p.is_anonymous then null else m.first_name || ' ' || left(m.last_name, 1) || '.' end,
    public.is_my_member(p.member_id),
    p.status,
    p.created_at,
    p.answered_at,
    p.audio_path is not null,
    p.audio_seconds
  from public.prayer_requests p
  join public.members m on m.id = p.member_id
  where p.organization_id = target_org_id
    and public.is_linked_member(target_org_id)
    and p.visibility = 'shared'
    and (p.status = 'open' or p.answered_at > now() - interval '14 days')
  order by p.created_at desc
  limit 100;
$$;
grant execute on function public.get_prayer_wall(uuid) to authenticated;

-- Reversal (run manually if needed): re-run get_prayer_wall from 0138, then
--   alter table public.prayer_requests drop constraint if exists prayer_requests_request_check,
--     add constraint prayer_requests_request_check check (length(trim(request)) between 3 and 1000);
--   alter table public.prayer_requests drop column if exists audio_path, drop column if exists audio_seconds;
--   (delete the bucket 'prayer-audio' from Storage once it is empty)
