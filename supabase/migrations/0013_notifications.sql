-- Real notifications, replacing the static sample list in the bell menu.
-- Scoped to an organization (any team member can see them — approving is
-- still admin-gated on the Members page itself). Written only by the
-- trigger below; there's no client insert/delete policy.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null default 'member_request',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_organization_id_idx on public.notifications (organization_id);
create index if not exists notifications_org_unread_idx
  on public.notifications (organization_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Org members can view notifications" on public.notifications;
create policy "Org members can view notifications"
  on public.notifications
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can mark notifications read" on public.notifications;
create policy "Org members can mark notifications read"
  on public.notifications
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Fires for every new pending join request, regardless of whether it came
-- through submit_member_request() or any future path that inserts a
-- pending member row.
create or replace function public.notify_new_member_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (organization_id, type, title, body, link)
    values (
      new.organization_id,
      'member_request',
      'New join request',
      trim(new.first_name || ' ' || new.last_name) || ' requested to join.',
      '/dashboard/members'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_member_request_created on public.members;
create trigger on_member_request_created
  after insert on public.members
  for each row
  execute function public.notify_new_member_request();
