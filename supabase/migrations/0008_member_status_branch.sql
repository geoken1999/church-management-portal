-- Adds membership status (active/left) and an optional branch assignment to
-- congregation members. branch_id is nullable and ON DELETE SET NULL — a
-- member record should survive its branch being removed.

alter table public.members
  add column if not exists status text not null default 'active' check (status in ('active', 'left')),
  add column if not exists branch_id uuid references public.branches (id) on delete set null;

create index if not exists members_branch_id_idx on public.members (branch_id);
