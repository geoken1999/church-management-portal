-- Youth age rule. An organization can set an age range (from..to, in whole
-- years); every active member whose age falls in it is added to the Youth
-- roster automatically, and one who leaves the range (or leaves the church)
-- is taken off again — but only if the rule added them. Someone added to
-- Youth by hand is never removed by the rule.
--
-- Ages are worked out from members.date_of_birth on the church's own
-- calendar day (organizations.timezone). Both numbers null = rule off.
alter table public.organizations
  add column if not exists youth_age_from smallint check (youth_age_from is null or youth_age_from between 0 and 100),
  add column if not exists youth_age_to smallint check (youth_age_to is null or youth_age_to between 0 and 100);

alter table public.organizations drop constraint if exists organizations_youth_age_range_check;
alter table public.organizations
  add constraint organizations_youth_age_range_check check (
    (youth_age_from is null and youth_age_to is null)
    or (youth_age_from is not null and youth_age_to is not null and youth_age_from <= youth_age_to)
  );

alter table public.youths
  add column if not exists auto_added boolean not null default false;

-- The members of an organization who fall in its youth age range today.
create or replace function public.youth_eligible_member_ids(target_org_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.id
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = target_org_id
    and o.youth_age_from is not null
    and o.youth_age_to is not null
    and m.status = 'active'
    and m.date_of_birth is not null
    and date_part('year', age((now() at time zone coalesce(o.timezone, 'Asia/Kolkata'))::date, m.date_of_birth))
        between o.youth_age_from and o.youth_age_to;
$$;

-- Brings one organization's Youth roster in line with its rule. Safe to run
-- any number of times.
create or replace function public.sync_youth_for_org(target_org_id uuid)
returns table (added integer, removed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  added_count integer := 0;
  removed_count integer := 0;
begin
  with inserted as (
    insert into public.youths (organization_id, member_id, auto_added)
    select target_org_id, id, true from public.youth_eligible_member_ids(target_org_id) as id
    on conflict (organization_id, member_id) do nothing
    returning 1
  )
  select count(*)::integer into added_count from inserted;

  with deleted as (
    delete from public.youths y
    where y.organization_id = target_org_id
      and y.auto_added
      and y.member_id not in (select public.youth_eligible_member_ids(target_org_id))
    returning 1
  )
  select count(*)::integer into removed_count from deleted;

  return query select added_count, removed_count;
end;
$$;

revoke all on function public.youth_eligible_member_ids(uuid) from public;
revoke all on function public.sync_youth_for_org(uuid) from public;
grant execute on function public.youth_eligible_member_ids(uuid) to service_role;
grant execute on function public.sync_youth_for_org(uuid) to service_role;

-- A new member, or a changed date of birth / status, is checked straight
-- away; the daily job covers birthdays moving people into or out of range.
create or replace function public.sync_youth_for_changed_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_from smallint;
  rule_to smallint;
  org_tz text;
  today date;
  in_range boolean;
begin
  select youth_age_from, youth_age_to, timezone into rule_from, rule_to, org_tz
  from public.organizations where id = new.organization_id;

  if rule_from is null or rule_to is null then
    return new;
  end if;

  today := (now() at time zone coalesce(org_tz, 'Asia/Kolkata'))::date;
  in_range := new.status = 'active'
    and new.date_of_birth is not null
    and date_part('year', age(today, new.date_of_birth)) between rule_from and rule_to;

  if in_range then
    insert into public.youths (organization_id, member_id, auto_added)
    values (new.organization_id, new.id, true)
    on conflict (organization_id, member_id) do nothing;
  else
    delete from public.youths where member_id = new.id and auto_added;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_youth_for_changed_member on public.members;
create trigger sync_youth_for_changed_member
  after insert or update of date_of_birth, status on public.members
  for each row execute function public.sync_youth_for_changed_member();

-- Reversal (run manually if needed):
--   drop trigger if exists sync_youth_for_changed_member on public.members;
--   drop function if exists public.sync_youth_for_changed_member();
--   drop function if exists public.sync_youth_for_org(uuid);
--   drop function if exists public.youth_eligible_member_ids(uuid);
--   alter table public.youths drop column if exists auto_added;
--   alter table public.organizations drop constraint if exists organizations_youth_age_range_check, drop column if exists youth_age_from, drop column if exists youth_age_to;
