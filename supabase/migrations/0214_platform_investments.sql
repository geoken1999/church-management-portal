-- Money put into KingdomFlow itself (the owner's capital, an investor, a loan), recorded next to the platform's
-- expenses in Super Admin → Expenses. Bookkeeping only: it doesn't move money. Service role only, like
-- platform_expenses.
create table if not exists public.platform_investments (
  id uuid primary key default gen_random_uuid(),
  invested_on date not null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Who put the money in.
  investor text not null check (length(trim(investor)) >= 2),
  category text not null default 'capital' check (category in ('capital', 'investor', 'loan', 'grant', 'other')),
  purpose text,
  reference text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_investments_invested_on_idx on public.platform_investments (invested_on desc);

alter table public.platform_investments enable row level security;
-- No policies: only the service role (Super Admin and the admin app API) reads or writes it.

-- Reversal (run manually if needed):
--   drop table if exists public.platform_investments;
