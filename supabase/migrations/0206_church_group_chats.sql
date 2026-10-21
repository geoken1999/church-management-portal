-- Group chats. The church team creates a group, adds church members (and team people) to it, and everyone in the
-- group chats in it from the member app, the team app and the web dashboard: text, photos and files, replies,
-- @mentions and announcements. Each person has their own notification setting for each group (all messages,
-- only mentions and announcements, or none, optionally muted until a time) and an unread count.
--
-- Who may do what is enforced here and by the server:
--  * Reading: only people in the group (RLS on the messages, which is also what Realtime follows).
--  * Writing (messages, members, groups): the server only, using the service role after its own checks. No
--    insert/update/delete policy exists for signed-in users.
--  * A person's own settings and read marker change only through the cg_* functions below.
-- Participants are church members (member_id) or team logins that are not members (auth_user_id only). A member's
-- login id is copied onto their row when they sign in, so they are in their groups from the first sign-in.

create table if not exists public.church_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists church_groups_org_idx on public.church_groups (organization_id, created_at desc);

create table if not exists public.church_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.church_groups (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  -- The login of this person (a member's is copied from members.auth_user_id; null until they sign in).
  auth_user_id uuid references auth.users (id) on delete cascade,
  -- 'admin' may also post announcements and manage the group's people from the app.
  role text not null default 'member' check (role in ('member', 'admin')),
  -- all: every message; mentions: only @mentions and announcements; none: nothing.
  notify_mode text not null default 'all' check (notify_mode in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  last_read_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  check (member_id is not null or auth_user_id is not null)
);
create unique index if not exists church_group_members_member_uniq on public.church_group_members (group_id, member_id) where member_id is not null;
create unique index if not exists church_group_members_login_uniq on public.church_group_members (group_id, auth_user_id) where auth_user_id is not null;
create index if not exists church_group_members_login_idx on public.church_group_members (auth_user_id) where auth_user_id is not null;
create index if not exists church_group_members_member_idx on public.church_group_members (member_id) where member_id is not null;

create table if not exists public.church_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.church_groups (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sender_auth_user_id uuid references auth.users (id) on delete set null,
  -- Kept on the message so it still reads right if the person is removed from the church.
  sender_name text not null,
  body text check (body is null or length(body) <= 4000),
  attachment_path text,
  attachment_name text check (attachment_name is null or length(attachment_name) <= 200),
  attachment_type text check (attachment_type is null or attachment_type in ('image', 'file')),
  attachment_size integer check (attachment_size is null or attachment_size >= 0),
  reply_to uuid references public.church_group_messages (id) on delete set null,
  is_announcement boolean not null default false,
  -- Logins of the people @mentioned.
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  -- A deleted message stays as a marker ("This message was deleted"); its words and file are removed.
  deleted_at timestamptz,
  check (deleted_at is not null or body is not null or attachment_path is not null)
);
create index if not exists church_group_messages_group_idx on public.church_group_messages (group_id, created_at desc);

drop trigger if exists set_church_groups_updated_at on public.church_groups;
create trigger set_church_groups_updated_at before update on public.church_groups for each row execute function public.set_updated_at();

-- A row's login and church are filled in and checked when it is added: the member and the group must belong to the
-- same church, and a member's login id is taken from the member.
create or replace function public.cg_member_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g_org uuid;
  m_org uuid;
  m_login uuid;
begin
  select organization_id into g_org from public.church_groups where id = new.group_id;
  if g_org is null or g_org <> new.organization_id then
    raise exception 'That group could not be found.';
  end if;
  if new.member_id is not null then
    select organization_id, auth_user_id into m_org, m_login from public.members where id = new.member_id;
    if m_org is null or m_org <> g_org then
      raise exception 'That member does not belong to this church.';
    end if;
    new.auth_user_id := m_login;
  end if;
  return new;
end;
$$;
drop trigger if exists church_group_members_before_insert on public.church_group_members;
create trigger church_group_members_before_insert before insert on public.church_group_members for each row execute function public.cg_member_before_insert();

-- When a member signs in to the app for the first time (or their login changes), their group rows follow.
create or replace function public.cg_sync_member_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id then
    update public.church_group_members set auth_user_id = new.auth_user_id where member_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists members_sync_group_login on public.members;
create trigger members_sync_group_login after update of auth_user_id on public.members for each row execute function public.cg_sync_member_login();

alter table public.church_groups enable row level security;
alter table public.church_group_members enable row level security;
alter table public.church_group_messages enable row level security;

-- Whether the signed-in person is in the group (also used by the messages policy, which Realtime follows).
create or replace function public.cg_is_participant(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.church_group_members gm where gm.group_id = p_group and gm.auth_user_id = auth.uid());
$$;

drop policy if exists "Participants can view their messages" on public.church_group_messages;
create policy "Participants can view their messages" on public.church_group_messages
  for select to authenticated using (public.cg_is_participant(group_id));
drop policy if exists "Participants can view their groups" on public.church_groups;
create policy "Participants can view their groups" on public.church_groups
  for select to authenticated using (public.cg_is_participant(id));
drop policy if exists "People can view their own group rows" on public.church_group_members;
create policy "People can view their own group rows" on public.church_group_members
  for select to authenticated using (auth_user_id = auth.uid());
-- No write policy anywhere: the server writes with the service role.

-- ---------------------------------------------------------------------------------------------
-- What the apps read (all for the signed-in person)
-- ---------------------------------------------------------------------------------------------

create or replace function public.cg_my_groups()
returns table (
  group_id uuid,
  organization_id uuid,
  name text,
  description text,
  role text,
  notify_mode text,
  muted_until timestamptz,
  unread integer,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_name text,
  member_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.organization_id, g.name, g.description, gm.role, gm.notify_mode, gm.muted_until,
         (select count(*)::int from public.church_group_messages m
           where m.group_id = g.id and m.created_at > gm.last_read_at and m.deleted_at is null
             and m.sender_auth_user_id is distinct from auth.uid()),
         lm.created_at,
         case when lm.id is null then null
              when lm.deleted_at is not null then 'This message was deleted'
              else coalesce(nullif(lm.body, ''), case lm.attachment_type when 'image' then 'Photo' else 'File' end) end,
         lm.sender_name,
         (select count(*)::int from public.church_group_members c where c.group_id = g.id)
    from public.church_group_members gm
    join public.church_groups g on g.id = gm.group_id and g.archived_at is null
    left join lateral (
      select m.id, m.created_at, m.body, m.attachment_type, m.sender_name, m.deleted_at
        from public.church_group_messages m where m.group_id = g.id order by m.created_at desc limit 1
    ) lm on true
   where gm.auth_user_id = auth.uid()
   order by coalesce(lm.created_at, g.created_at) desc;
$$;

create or replace function public.cg_messages(p_group uuid, p_before timestamptz default null, p_limit integer default 40)
returns table (
  id uuid,
  sender_auth_user_id uuid,
  sender_name text,
  body text,
  attachment_type text,
  attachment_name text,
  attachment_size integer,
  reply_to uuid,
  reply_sender text,
  reply_body text,
  is_announcement boolean,
  mentions uuid[],
  created_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cg_is_participant(p_group) then
    raise exception 'You are not in this group.';
  end if;
  return query
    select m.id, m.sender_auth_user_id, m.sender_name, m.body, m.attachment_type, m.attachment_name, m.attachment_size,
           m.reply_to, r.sender_name,
           case when r.id is null then null when r.deleted_at is not null then 'This message was deleted'
                else left(coalesce(nullif(r.body, ''), case r.attachment_type when 'image' then 'Photo' else 'File' end), 120) end,
           m.is_announcement, m.mentions, m.created_at, m.deleted_at
      from public.church_group_messages m
      left join public.church_group_messages r on r.id = m.reply_to
     where m.group_id = p_group and (p_before is null or m.created_at < p_before)
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;

create or replace function public.cg_participants(p_group uuid)
returns table (auth_user_id uuid, member_id uuid, name text, role text, is_staff boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.cg_is_participant(p_group) then
    raise exception 'You are not in this group.';
  end if;
  return query
    select gm.auth_user_id, gm.member_id,
           coalesce(nullif(trim(coalesce(mb.first_name, '') || ' ' || coalesce(mb.last_name, '')), ''),
                    nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), 'Member'),
           gm.role, gm.member_id is null
      from public.church_group_members gm
      left join public.members mb on mb.id = gm.member_id
      left join public.profiles pr on pr.auth_user_id = gm.auth_user_id
     where gm.group_id = p_group
     order by 3;
end;
$$;

create or replace function public.cg_mark_read(p_group uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.church_group_members set last_read_at = now() where group_id = p_group and auth_user_id = auth.uid();
$$;

create or replace function public.cg_set_notifications(p_group uuid, p_mode text, p_muted_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mode not in ('all', 'mentions', 'none') then
    raise exception 'Choose all messages, mentions only, or none.';
  end if;
  update public.church_group_members
     set notify_mode = p_mode, muted_until = case when p_muted_until is not null and p_muted_until > now() then p_muted_until end
   where group_id = p_group and auth_user_id = auth.uid();
  if not found then
    raise exception 'You are not in this group.';
  end if;
end;
$$;

revoke all on function public.cg_is_participant(uuid), public.cg_my_groups(), public.cg_messages(uuid, timestamptz, integer),
  public.cg_participants(uuid), public.cg_mark_read(uuid), public.cg_set_notifications(uuid, text, timestamptz) from public, anon;
grant execute on function public.cg_is_participant(uuid), public.cg_my_groups(), public.cg_messages(uuid, timestamptz, integer),
  public.cg_participants(uuid), public.cg_mark_read(uuid), public.cg_set_notifications(uuid, text, timestamptz) to authenticated;
revoke all on function public.cg_member_before_insert(), public.cg_sync_member_login() from public, anon, authenticated;

-- Attachments live in a private bucket that only the server touches (links are signed after a membership check).
insert into storage.buckets (id, name, public, file_size_limit)
values ('group-chat', 'group-chat', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- New messages reach the apps live through Realtime (which applies the select policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'church_group_messages') then
    alter publication supabase_realtime add table public.church_group_messages;
  end if;
end $$;

-- Reversal (run manually if needed):
--   drop table if exists public.church_group_messages, public.church_group_members, public.church_groups;
--   drop function if exists public.cg_is_participant(uuid), public.cg_my_groups(), public.cg_messages(uuid, timestamptz, integer),
--     public.cg_participants(uuid), public.cg_mark_read(uuid), public.cg_set_notifications(uuid, text, timestamptz),
--     public.cg_member_before_insert(), public.cg_sync_member_login();
--   drop trigger if exists members_sync_group_login on public.members;
--   delete from storage.buckets where id = 'group-chat';
