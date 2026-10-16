-- Account deletion requests from the public web form (/delete-account), for people who cannot sign
-- in to the app: lost phone, no access any more, or they only ever filled in a church's form. The
-- person confirms from a link emailed to them (status goes unverified -> pending), then the
-- platform admin handles it from Super Admin -> Deletions. Only the server touches this table.
create table if not exists public.deletion_form_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  church_name text,
  relationship text not null check (relationship in ('member', 'team', 'owner', 'guest', 'other')),
  -- account: delete my sign-in; account_and_data: also delete my records held by the church.
  scope text not null default 'account_and_data' check (scope in ('account', 'account_and_data')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'unverified' check (status in ('unverified', 'pending', 'completed', 'rejected')),
  -- Only a hash of the emailed confirmation token is kept.
  token_hash text,
  token_expires_at timestamptz,
  verified_at timestamptz,
  outcome_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per email address.
create unique index if not exists deletion_form_requests_one_open_idx
  on public.deletion_form_requests (lower(email)) where status in ('unverified', 'pending');
create index if not exists deletion_form_requests_status_idx on public.deletion_form_requests (status, created_at desc);
create index if not exists deletion_form_requests_token_idx on public.deletion_form_requests (token_hash);

alter table public.deletion_form_requests enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.deletion_form_requests;
