-- Adding a person to an existing family also goes for approval: the family's owner asks
-- (a family_requests row of kind 'add', pointing at the family, with the one person in
-- "people"), and an owner or admin approves it. Creating a family stays kind 'create'.
alter table public.family_requests
  add column if not exists kind text not null default 'create' check (kind in ('create', 'add')),
  add column if not exists target_family_id uuid references public.families (id) on delete cascade;

-- Reversal (run manually if needed):
--   alter table public.family_requests drop column if exists target_family_id, drop column if exists kind;
