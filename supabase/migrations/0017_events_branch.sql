-- Adds an optional branch/location to events. branch_id is nullable and
-- ON DELETE SET NULL — an event survives its branch being removed. Null
-- means "open meeting" (not specific to any branch), rather than a
-- separate flag, so there's only one source of truth for an event's
-- location.

alter table public.events
  add column if not exists branch_id uuid references public.branches (id) on delete set null;

create index if not exists events_branch_id_idx on public.events (branch_id);
