-- The member who asked for a family (and got it approved) owns it: they can rename it and
-- add or remove its people from the app. Everyone else in it can only leave. Families an
-- admin made have no owner. A person can be in one family only; the app enforces that.
alter table public.families
  add column if not exists owner_member_id uuid references public.members (id) on delete set null;

create index if not exists families_owner_member_id_idx on public.families (owner_member_id);

-- Reversal (run manually if needed):
--   alter table public.families drop column if exists owner_member_id;
