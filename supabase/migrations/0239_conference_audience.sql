-- Who a Zoom or Google Meet meeting is for: the whole church, one branch or one group. Only that audience is sent the
-- "meeting is live" push notification.
alter table public.conference_meetings
  add column if not exists audience_type text not null default 'church' check (audience_type in ('church', 'branch', 'group')),
  add column if not exists audience_branch_id uuid references public.branches (id) on delete set null,
  add column if not exists audience_group_key text check (audience_group_key is null or audience_group_key in ('leaders', 'youth', 'worship', 'media', 'committee'));
