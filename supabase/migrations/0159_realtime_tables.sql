-- Live updates in the mobile app: when someone changes data on the web (or on
-- another phone), the open screens refresh themselves. The app listens to row
-- changes through Supabase Realtime, which only sends changes for tables in the
-- supabase_realtime publication. Row Level Security still decides who is told
-- about what. Safe to re-run: a table already in the publication is skipped.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'members', 'member_profile_update_requests', 'events', 'event_registrations',
    'todos', 'todo_events', 'plans', 'branches', 'leaders', 'youths', 'committee_members',
    'families', 'family_members', 'attendance_sessions', 'attendance_records',
    'prayer_requests', 'group_posts', 'member_home_layouts', 'offerings', 'donations',
    'fundraisers', 'ministries', 'worship_team_members', 'media_team_members',
    'notifications', 'forms', 'form_responses', 'worship_documents', 'media_documents'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Reversal (run manually if needed): alter publication supabase_realtime drop table public.<table>;
