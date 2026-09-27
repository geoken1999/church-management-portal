-- Lets an org owner/admin pick which of the dashboard's ~32 nav items will
-- be available in the future dedicated mobile app (see proxy.ts's comment
-- on why phones are currently redirected to /mobile-restricted) — capped
-- at 15, a sensible ceiling for a phone-sized nav. Nothing reads this yet;
-- it's the settings surface a mobile client will consume once it exists.
--
-- The item-key list in the second check constraint mirrors NAV_GROUPS in
-- src/components/dashboard/DashboardShell.tsx (also duplicated in the i18n
-- dictionaries' nav.items) — same "keep in sync when the nav changes"
-- caveat as migration 0081's locale check.
alter table public.organizations
  add column if not exists mobile_features text[] not null default '{}';

alter table public.organizations
  drop constraint if exists organizations_mobile_features_limit,
  add constraint organizations_mobile_features_limit check (cardinality(mobile_features) <= 15);

alter table public.organizations
  drop constraint if exists organizations_mobile_features_valid_keys,
  add constraint organizations_mobile_features_valid_keys check (
    mobile_features <@ array[
      'dashboard','profile','team','billing','branches',
      'members','leaders','youth','committee','families',
      'ministries','worship','media','events','todos',
      'forms','folder','attendance','reports','widget','accounting',
      'fundraisers','offerings','donations',
      'email','sms','whatsapp',
      'instagram','youtube','facebook',
      'documentation','support'
    ]::text[]
  );
