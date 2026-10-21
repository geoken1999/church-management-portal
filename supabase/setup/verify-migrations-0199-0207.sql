-- Read-only check: which of migrations 0199 to 0207 have been applied. Run it in the Supabase SQL editor (it changes
-- nothing). Each row says OK or MISSING for one thing a migration creates (a table, column, function, policy, bucket
-- or trigger). A migration with any MISSING row still needs to be run, in order. The last query summarises one line
-- per migration, so you can see at a glance which to run.
--
-- Extend it when a new migration is added: one row per object, named by the migration's file.
with checks(migration, what, ok) as (
  values
  -- 0199: voice prayers
  ('0199_prayer_voice', 'column prayer_requests.audio_path', exists (select 1 from information_schema.columns where table_schema='public' and table_name='prayer_requests' and column_name='audio_path')),
  ('0199_prayer_voice', 'column prayer_requests.audio_seconds', exists (select 1 from information_schema.columns where table_schema='public' and table_name='prayer_requests' and column_name='audio_seconds')),
  ('0199_prayer_voice', 'storage bucket prayer-audio (private)', exists (select 1 from storage.buckets where id='prayer-audio' and public = false)),
  ('0199_prayer_voice', 'get_prayer_wall returns has_audio', exists (select 1 from pg_proc where proname='get_prayer_wall' and pg_get_function_result(oid) like '%has_audio%')),

  -- 0200: change tickets and the program request notice
  ('0200_change_tickets', 'table change_tickets', to_regclass('public.change_tickets') is not null),
  ('0200_change_tickets', 'table change_ticket_comments', to_regclass('public.change_ticket_comments') is not null),
  ('0200_change_tickets', 'row level security on change_tickets', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.change_tickets')), false)),
  ('0200_change_tickets', 'function notify_program_request', exists (select 1 from pg_proc where proname='notify_program_request')),
  ('0200_change_tickets', 'trigger on_program_request_created', exists (select 1 from pg_trigger where tgname='on_program_request_created' and not tgisinternal)),

  -- 0201: what a saved notification is about
  ('0201_notification_target', 'column member_notifications.data', exists (select 1 from information_schema.columns where table_schema='public' and table_name='member_notifications' and column_name='data')),

  -- 0202: quizzes, grading and certificates
  ('0202_lms_quizzes_certificates', 'table lms_quizzes', to_regclass('public.lms_quizzes') is not null),
  ('0202_lms_quizzes_certificates', 'table lms_quiz_questions', to_regclass('public.lms_quiz_questions') is not null),
  ('0202_lms_quizzes_certificates', 'table lms_quiz_attempts', to_regclass('public.lms_quiz_attempts') is not null),
  ('0202_lms_quizzes_certificates', 'table lms_certificates', to_regclass('public.lms_certificates') is not null),
  ('0202_lms_quizzes_certificates', 'column lms_settings.issue_certificates', exists (select 1 from information_schema.columns where table_schema='public' and table_name='lms_settings' and column_name='issue_certificates')),
  ('0202_lms_quizzes_certificates', 'function lms_submit_quiz', exists (select 1 from pg_proc where proname='lms_submit_quiz')),
  ('0202_lms_quizzes_certificates', 'function lms_grade_attempt', exists (select 1 from pg_proc where proname='lms_grade_attempt')),
  ('0202_lms_quizzes_certificates', 'function lms_verify_certificate', exists (select 1 from pg_proc where proname='lms_verify_certificate')),
  ('0202_lms_quizzes_certificates', 'trigger on_lms_enrollment_completed', exists (select 1 from pg_trigger where tgname='on_lms_enrollment_completed' and not tgisinternal)),

  -- 0203: assignments
  ('0203_lms_assignments', 'table lms_assignments', to_regclass('public.lms_assignments') is not null),
  ('0203_lms_assignments', 'table lms_assignment_submissions', to_regclass('public.lms_assignment_submissions') is not null),
  ('0203_lms_assignments', 'function lms_submit_assignment', exists (select 1 from pg_proc where proname='lms_submit_assignment')),
  ('0203_lms_assignments', 'function lms_grade_assignment', exists (select 1 from pg_proc where proname='lms_grade_assignment')),
  ('0203_lms_assignments', 'storage bucket lms-submissions (private)', exists (select 1 from storage.buckets where id='lms-submissions' and public = false)),
  ('0203_lms_assignments', 'lms_complete_lesson knows assignments', exists (select 1 from pg_proc where proname='lms_complete_lesson' and prosrc like '%Hand in the assignment%')),

  -- 0204: K-Connect minutes
  ('0204_kconnect_minutes', 'column organizations.addon_kmeet_minutes', exists (select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='addon_kmeet_minutes')),
  ('0204_kconnect_minutes', 'column organizations.addon_kmeet_month', exists (select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='addon_kmeet_month')),
  ('0204_kconnect_minutes', 'add-on orders accept the kconnect type', exists (select 1 from pg_constraint where conname='organization_addon_orders_addon_type_check' and pg_get_constraintdef(oid) like '%kconnect%')),

  -- 0205: service users for the admin app
  ('0205_platform_service_users', 'table platform_service_users', to_regclass('public.platform_service_users') is not null),
  ('0205_platform_service_users', 'row level security on platform_service_users', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.platform_service_users')), false)),

  -- 0206: group chats
  ('0206_church_group_chats', 'table church_groups', to_regclass('public.church_groups') is not null),
  ('0206_church_group_chats', 'table church_group_members', to_regclass('public.church_group_members') is not null),
  ('0206_church_group_chats', 'table church_group_messages', to_regclass('public.church_group_messages') is not null),
  ('0206_church_group_chats', 'row level security on church_group_messages', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.church_group_messages')), false)),
  ('0206_church_group_chats', 'function cg_my_groups', exists (select 1 from pg_proc where proname='cg_my_groups')),
  ('0206_church_group_chats', 'function cg_messages', exists (select 1 from pg_proc where proname='cg_messages')),
  ('0206_church_group_chats', 'function cg_participants', exists (select 1 from pg_proc where proname='cg_participants')),
  ('0206_church_group_chats', 'function cg_mark_read', exists (select 1 from pg_proc where proname='cg_mark_read')),
  ('0206_church_group_chats', 'function cg_set_notifications', exists (select 1 from pg_proc where proname='cg_set_notifications')),
  ('0206_church_group_chats', 'trigger members_sync_group_login', exists (select 1 from pg_trigger where tgname='members_sync_group_login' and not tgisinternal)),
  ('0206_church_group_chats', 'storage bucket group-chat (private)', exists (select 1 from storage.buckets where id='group-chat' and public = false)),
  ('0206_church_group_chats', 'messages are sent live (Realtime publication)', exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='church_group_messages')),

  -- 0207: the team follows group chats on the web
  ('0207_group_chat_team_view', 'function cg_team_can_view', exists (select 1 from pg_proc where proname='cg_team_can_view')),
  ('0207_group_chat_team_view', 'policy "Team can view group messages"', exists (select 1 from pg_policies where schemaname='public' and tablename='church_group_messages' and policyname='Team can view group messages')),
  ('0207_group_chat_team_view', 'policy "Team can view groups"', exists (select 1 from pg_policies where schemaname='public' and tablename='church_groups' and policyname='Team can view groups'))
)
-- One line per migration: OK when everything it creates is there, otherwise how many things are missing and which.
select migration,
       case when bool_and(ok) then 'OK' else 'MISSING ' || count(*) filter (where not ok) || ' of ' || count(*) end as status,
       coalesce(string_agg(what, '; ') filter (where not ok), '') as missing
from checks
group by migration
order by migration;

-- To see every single check instead, replace the final select above with:
--   select migration, what, case when ok then 'OK' else 'MISSING' end as status from checks order by migration, what;
