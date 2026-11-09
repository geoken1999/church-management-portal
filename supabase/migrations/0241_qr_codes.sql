-- Dynamic QR codes: a short link (/q/<code>) a church prints once and can re-point later, with an optional different
-- destination per platform (iPhone, Android, computer), a look (colours, shapes, logo, label), an expiry, and a scan
-- count. The public /q/<code> route reads and writes with the service role; staff go through the dashboard under the
-- QR Codes tab.
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  destination_url text not null,
  ios_url text,
  android_url text,
  desktop_url text,
  expires_at timestamptz,
  expired_url text,
  status text not null default 'active' check (status in ('active', 'paused')),
  design jsonb not null default '{}'::jsonb,
  scan_count integer not null default 0,
  last_scanned_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qr_codes_org on public.qr_codes (organization_id, created_at desc);

create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  qr_code_id uuid not null references public.qr_codes (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'desktop')),
  country text,
  scanned_at timestamptz not null default now()
);
create index if not exists qr_scans_code_time on public.qr_scans (qr_code_id, scanned_at desc);

alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;

drop policy if exists "Members can view their org's QR codes" on public.qr_codes;
create policy "Members can view their org's QR codes"
  on public.qr_codes for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "Members can create QR codes" on public.qr_codes;
create policy "Members can create QR codes"
  on public.qr_codes for insert to authenticated
  with check (public.is_org_member(organization_id));
drop policy if exists "Members can update QR codes" on public.qr_codes;
create policy "Members can update QR codes"
  on public.qr_codes for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists "Members can delete QR codes" on public.qr_codes;
create policy "Members can delete QR codes"
  on public.qr_codes for delete to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can view their org's QR scans" on public.qr_scans;
create policy "Members can view their org's QR scans"
  on public.qr_scans for select to authenticated
  using (public.is_org_member(organization_id));

-- One scan: the row and the running count together. Called by the public redirect only.
create or replace function public.record_qr_scan(p_qr uuid, p_org uuid, p_platform text, p_country text)
returns void
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.qr_scans (qr_code_id, organization_id, platform, country)
    values (p_qr, p_org, p_platform, p_country)
  )
  update public.qr_codes set scan_count = scan_count + 1, last_scanned_at = now() where id = p_qr;
$$;
revoke execute on function public.record_qr_scan(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_qr_scan(uuid, uuid, text, text) to service_role;
