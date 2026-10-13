-- A person's own notification inbox, shown in the app's notification center.
-- Every push notification KingdomFlow sends to someone (church announcements, a
-- task assigned to them, event updates, ...) is also saved here, so they can read
-- it later, mark it read, or clear it, even if the phone notification was missed
-- or push isn't set up. Rows are written by the server; a person can read, mark
-- read and delete only their own.
create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  title text not null,
  body text,
  link text,
  button_label text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_notifications_user_idx on public.member_notifications (auth_user_id, created_at desc);

alter table public.member_notifications enable row level security;

drop policy if exists "People read their own notifications" on public.member_notifications;
create policy "People read their own notifications"
  on public.member_notifications for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "People mark their own notifications read" on public.member_notifications;
create policy "People mark their own notifications read"
  on public.member_notifications for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists "People clear their own notifications" on public.member_notifications;
create policy "People clear their own notifications"
  on public.member_notifications for delete to authenticated
  using (auth_user_id = auth.uid());

-- Live updates in the app (see 0159).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_notifications') then
    alter publication supabase_realtime add table public.member_notifications;
  end if;
end $$;

-- Reversal (run manually if needed): drop table if exists public.member_notifications;
