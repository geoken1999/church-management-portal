-- K-Audio: an audio-only sibling of K-meet, sharing this same table
-- rather than a parallel one — every other column (scheduling, admission,
-- room id, duration snapshot) is identical in shape for both. Existing
-- rows default to 'video' (K-meet), so nothing already scheduled changes.
alter table public.kmeet_meetings
  add column if not exists mode text not null default 'video' check (mode in ('video', 'audio'));
