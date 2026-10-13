-- A report is now one per church, period, branch AND language, so making the same report
-- in another language adds a new copy instead of replacing the first.
drop index if exists public.monthly_reports_unique_idx;
create unique index if not exists monthly_reports_unique_idx
  on public.monthly_reports (organization_id, period, language, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Reversal (run manually if needed; fails if two languages already exist for one period):
--   drop index if exists public.monthly_reports_unique_idx;
--   create unique index monthly_reports_unique_idx on public.monthly_reports (organization_id, period, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
