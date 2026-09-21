-- Corrects a backfill mistake in 0030: `alter table ... add column provider
-- ... default 'shared'` stamped every pre-existing email_campaigns row as
-- 'shared', including ones actually sent through an org's own SMTP server
-- before this column existed (SMTP settings shipped before quota tracking
-- did) — those rows were wrongly counting against the shared plan quota.
--
-- Every campaign inserted from here on already tags its real provider
-- correctly (see sendBulkEmailAction), so this only needs to touch the
-- historical gap: reclassify a 'shared' row as 'smtp' when the org
-- currently has SMTP settings saved, since that's the best signal
-- available for what it actually went through. This isn't perfect — an
-- org that configured SMTP only briefly, or removed it since, won't be
-- corrected precisely — but it fixes the common case of "I set up Gmail
-- SMTP and my test sends are still counted as shared."
update public.email_campaigns c
set provider = 'smtp'
where c.provider = 'shared'
  and exists (
    select 1 from public.email_smtp_settings s
    where s.organization_id = c.organization_id
  );
