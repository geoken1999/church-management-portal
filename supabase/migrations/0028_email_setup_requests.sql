-- "Raise a ticket" for orgs that don't want to configure their own SMTP —
-- an admin asks the app operator to enable the shared Resend provider for
-- them instead. There's no cross-tenant admin dashboard in this app yet, so
-- the operator reviews/resolves these directly in the Supabase table
-- editor; this table is just the intake, not a full support system.
create table if not exists public.email_setup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid references public.profiles (auth_user_id) on delete set null,
  message text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists email_setup_requests_organization_id_idx
  on public.email_setup_requests (organization_id, created_at desc);

alter table public.email_setup_requests enable row level security;

-- Admins can see and raise requests for their own org; there's no
-- select-all policy for other orgs, since this isn't meant to be a
-- cross-tenant support inbox inside the app itself.
drop policy if exists "Admins can view their org's setup requests" on public.email_setup_requests;
create policy "Admins can view their org's setup requests"
  on public.email_setup_requests for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can raise a setup request" on public.email_setup_requests;
create policy "Admins can raise a setup request"
  on public.email_setup_requests for insert to authenticated
  with check (public.is_org_admin(organization_id));
