-- Read-only check: which of migrations 0182 to 0198 have been applied. Run it in the Supabase SQL editor.
-- Each row says OK or MISSING for one migration, judged by a table, column or function it creates. A
-- migration marked MISSING (or any after it) still needs to be run, in order.
with checks(migration, what, ok) as (
  values
  ('0182_app_popups', 'table app_popups', to_regclass('public.app_popups') is not null),
  ('0183_app_popup_images', 'column app_popups.image_url', exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_popups' and column_name='image_url')),
  ('0184_tenant_onboarding', 'table tenant_onboarding', to_regclass('public.tenant_onboarding') is not null),
  ('0185_onboarding_plan_type_credits', 'column tenant_onboarding.plan_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tenant_onboarding' and column_name='plan_type')),
  ('0186_auth_attempts', 'table auth_attempts', to_regclass('public.auth_attempts') is not null),
  ('0187_deletion_form_requests', 'table account_deletion_requests', to_regclass('public.account_deletion_requests') is not null),
  ('0188_cancel_at_period_end', 'column subscriptions.cancel_at_period_end', exists (select 1 from information_schema.columns where table_schema='public' and column_name='cancel_at_period_end')),
  ('0189_special_day_digests', 'table special_day_digests', to_regclass('public.special_day_digests') is not null),
  ('0190_lms_foundation', 'tables lms_programs, lms_courses, lms_enrollments', to_regclass('public.lms_programs') is not null and to_regclass('public.lms_courses') is not null and to_regclass('public.lms_enrollments') is not null),
  ('0191_lms_learning', 'function lms_catalog', exists (select 1 from pg_proc where proname='lms_catalog')),
  ('0192_lms_video_progress', 'function lms_save_playback', exists (select 1 from pg_proc where proname='lms_save_playback')),
  ('0193_lms_live_classes', 'table lms_live_sessions', to_regclass('public.lms_live_sessions') is not null),
  ('0194_lms_students', 'table lms_student_applications', to_regclass('public.lms_student_applications') is not null),
  ('0195_special_day_tomorrow', 'column special_day_digests.kind', exists (select 1 from information_schema.columns where table_schema='public' and table_name='special_day_digests' and column_name='kind')),
  ('0196_bible_school_access', 'table bible_school_access', to_regclass('public.bible_school_access') is not null),
  ('0197_lms_paid_courses', 'table lms_payment_orders', to_regclass('public.lms_payment_orders') is not null),
  ('0197_lms_paid_courses', 'table course_payouts', to_regclass('public.course_payouts') is not null),
  ('0198_lms_program_enrollment', 'table lms_program_enrollments', to_regclass('public.lms_program_enrollments') is not null),
  ('0198_lms_program_enrollment', 'function lms_enroll_program', exists (select 1 from pg_proc where proname='lms_enroll_program')),
  ('0198_lms_program_enrollment', 'approve function has the program argument',
     exists (select 1 from pg_proc where proname='lms_approve_application' and pronargs = 5))
)
select migration, what, case when ok then 'OK' else 'MISSING' end as status
from checks
order by migration, what;
