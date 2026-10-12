-- 1. Group posts: notes and links an admin shares with a group of members
--    (Leaders, Youth, Worship team, Media team, Committee). A member who is
--    in the group sees them in the mobile app's Space tab, under the group.
--    The worship and media teams also see their document libraries there
--    (read through get_group_documents below), so those files are shared with
--    the team without uploading them twice.
create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  group_key text not null check (group_key in ('leaders', 'youth', 'worship', 'media', 'committee')),
  title text not null check (length(trim(title)) between 2 and 80),
  body text check (body is null or length(body) <= 2000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_posts_org_group_idx on public.group_posts (organization_id, group_key, created_at desc);

drop trigger if exists set_group_posts_updated_at on public.group_posts;
create trigger set_group_posts_updated_at
  before update on public.group_posts
  for each row execute function public.set_updated_at();

-- The church team can read its posts directly; writes go through the server,
-- which checks the matching tab's permission. Members read through the
-- functions below, never the table.
alter table public.group_posts enable row level security;

drop policy if exists "Org members can view group posts" on public.group_posts;
create policy "Org members can view group posts"
  on public.group_posts for select to authenticated
  using (public.is_org_member(organization_id));

-- Whether the signed-in member (phone login) is in this group.
create or replace function public.in_my_group(target_org_id uuid, target_group text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_linked_member(target_org_id) and exists (
    select 1
    from public.members m
    where m.organization_id = target_org_id
      and m.auth_user_id = auth.uid()
      and m.status = 'active'
      and case target_group
        when 'leaders' then exists (select 1 from public.leaders x where x.member_id = m.id)
        when 'youth' then exists (select 1 from public.youths x where x.member_id = m.id)
        when 'worship' then exists (select 1 from public.worship_team_members x where x.member_id = m.id)
        when 'media' then exists (select 1 from public.media_team_members x where x.member_id = m.id)
        when 'committee' then exists (select 1 from public.committee_members x where x.member_id = m.id)
        else false
      end
  );
$$;

-- The groups the signed-in member is in, with how many things are shared
-- with each.
create or replace function public.get_my_groups(target_org_id uuid)
returns table (group_key text, shared_count integer)
language sql
security definer
stable
set search_path = public
as $$
  select g.key, (
    (select count(*) from public.group_posts p where p.organization_id = target_org_id and p.group_key = g.key)
    + case g.key
        when 'worship' then (select count(*) from public.worship_documents d where d.organization_id = target_org_id)
        when 'media' then (select count(*) from public.media_documents d where d.organization_id = target_org_id)
        else 0
      end
  )::integer
  from (values ('leaders'), ('youth'), ('worship'), ('media'), ('committee')) as g(key)
  where public.in_my_group(target_org_id, g.key);
$$;

create or replace function public.get_group_posts(target_org_id uuid, target_group text)
returns table (id uuid, title text, body text, link_url text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.title, p.body, p.link_url, p.created_at
  from public.group_posts p
  where p.organization_id = target_org_id
    and p.group_key = target_group
    and public.in_my_group(target_org_id, target_group)
  order by p.created_at desc
  limit 100;
$$;

-- The worship and media teams' document libraries, for members of those
-- teams. kind tells the app how to open it: 'worship' via the masked share
-- link (token), 'media' via the public storage file (path).
create or replace function public.get_group_documents(target_org_id uuid, target_group text)
returns table (id uuid, title text, file_type text, kind text, share_token uuid, file_path text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.title, d.file_type, 'worship', d.share_token, null::text, d.created_at
  from public.worship_documents d
  where target_group = 'worship' and d.organization_id = target_org_id and public.in_my_group(target_org_id, 'worship')
  union all
  select d.id, d.title, d.file_type, 'media', null::uuid, d.file_path, d.created_at
  from public.media_documents d
  where target_group = 'media' and d.organization_id = target_org_id and public.in_my_group(target_org_id, 'media')
  order by created_at desc
  limit 100;
$$;

grant execute on function public.in_my_group(uuid, text) to authenticated;
grant execute on function public.get_my_groups(uuid) to authenticated;
grant execute on function public.get_group_posts(uuid, text) to authenticated;
grant execute on function public.get_group_documents(uuid, text) to authenticated;

-- 2. A person can withdraw their own pending account-deletion request.
drop policy if exists "People can withdraw their pending deletion request" on public.account_deletion_requests;
create policy "People can withdraw their pending deletion request"
  on public.account_deletion_requests for delete to authenticated
  using (auth_user_id = auth.uid() and status = 'pending');

-- Reversal (run manually if needed):
--   drop policy if exists "People can withdraw their pending deletion request" on public.account_deletion_requests;
--   drop function if exists public.get_group_documents(uuid, text);
--   drop function if exists public.get_group_posts(uuid, text);
--   drop function if exists public.get_my_groups(uuid);
--   drop function if exists public.in_my_group(uuid, text);
--   drop table if exists public.group_posts;
