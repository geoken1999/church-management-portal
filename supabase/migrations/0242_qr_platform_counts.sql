-- Scans per platform kept on the QR code itself, so the list can show iPhone, Android and computer visits without
-- counting scan rows for every card. Backfilled from the scans already recorded.
alter table public.qr_codes
  add column if not exists ios_scans integer not null default 0,
  add column if not exists android_scans integer not null default 0,
  add column if not exists desktop_scans integer not null default 0;

update public.qr_codes q set
  ios_scans = coalesce((select count(*) from public.qr_scans s where s.qr_code_id = q.id and s.platform = 'ios'), 0),
  android_scans = coalesce((select count(*) from public.qr_scans s where s.qr_code_id = q.id and s.platform = 'android'), 0),
  desktop_scans = coalesce((select count(*) from public.qr_scans s where s.qr_code_id = q.id and s.platform = 'desktop'), 0);

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
  update public.qr_codes set
    scan_count = scan_count + 1,
    ios_scans = ios_scans + (p_platform = 'ios')::int,
    android_scans = android_scans + (p_platform = 'android')::int,
    desktop_scans = desktop_scans + (p_platform = 'desktop')::int,
    last_scanned_at = now()
  where id = p_qr;
$$;
