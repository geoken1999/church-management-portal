-- The daily special-days job now also sends owners and admins a heads-up the day before. Each kind of
-- summary ('today' or 'tomorrow') is recorded once per church per day.
alter table public.special_day_digests add column if not exists kind text not null default 'today';
alter table public.special_day_digests drop constraint if exists special_day_digests_pkey;
alter table public.special_day_digests add primary key (organization_id, day, kind);

-- Reversal (run manually if needed):
--   delete from public.special_day_digests where kind <> 'today';
--   alter table public.special_day_digests drop constraint special_day_digests_pkey, add primary key (organization_id, day);
--   alter table public.special_day_digests drop column kind;
