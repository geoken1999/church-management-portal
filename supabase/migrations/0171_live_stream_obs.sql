-- Streaming a live stream from OBS (or any WHIP encoder): each stream gets a private
-- key the encoder signs in with. The key lets an encoder send video into that one
-- stream's room and nothing else.
alter table public.live_streams
  add column if not exists ingest_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists ingest_active boolean not null default false,
  add column if not exists ingest_session text;

-- Reversal (run manually if needed):
--   alter table public.live_streams drop column if exists ingest_key, drop column if exists ingest_active, drop column if exists ingest_session;
