-- Adds "planner" to the set of valid organizations.mobile_features keys
-- (migration 0084) now that the Planner tool exists (migration 0086) — the
-- selectable pool on /dashboard/mobile mirrors NAV_GROUPS, and this
-- constraint is the DB-side half of that same list; keep both in sync when
-- the nav changes.
alter table public.organizations
  drop constraint if exists organizations_mobile_features_valid_keys,
  add constraint organizations_mobile_features_valid_keys check (
    mobile_features <@ array[
      'dashboard','profile','team','billing','branches',
      'members','leaders','youth','committee','families',
      'ministries','worship','media','events','todos',
      'planner','forms','folder','attendance','reports','widget','accounting',
      'fundraisers','offerings','donations',
      'email','sms','whatsapp',
      'instagram','youtube','facebook',
      'documentation','support'
    ]::text[]
  );
