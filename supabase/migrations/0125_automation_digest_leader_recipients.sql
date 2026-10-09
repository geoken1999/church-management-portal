-- Staff digest recipients are now picked from the org's leaders (up to 3)
-- instead of typed in as raw phone numbers: the number is resolved from
-- the leader's member record when the digest is sent, so a leader's phone
-- change never leaves the automation pointing at a stale number, and the
-- digest can't silently go to an empty list because nobody typed anything.
-- recipient_phones stays for rows saved before this, and is merged in at
-- send time.
--
-- Holds leaders.id values. No FK is possible on a uuid[]; the send path
-- ignores ids whose leader has since been removed.
alter table public.automation_destinations
  add column if not exists recipient_leader_ids uuid[] not null default '{}'
    check (cardinality(recipient_leader_ids) <= 3);

-- Reversal (run manually if needed):
--   alter table public.automation_destinations drop column if exists recipient_leader_ids;
