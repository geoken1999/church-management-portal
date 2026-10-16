-- Failed sign-in (and similar) attempts, kept briefly so repeated guessing can be slowed down.
-- Keys are hashed (email or IP), never the raw value. Only the server writes here, so there are no
-- policies on purpose.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_attempts_key_created_idx on public.auth_attempts (key, created_at desc);
alter table public.auth_attempts enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.auth_attempts;
