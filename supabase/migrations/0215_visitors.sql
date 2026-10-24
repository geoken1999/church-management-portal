-- Visitors: first-time guests who scan the church's QR code and leave their details. The church never adds
-- or edits one by hand. The day after the visit a WhatsApp message asks for feedback (and whether they would
-- like a follow-up). When the person becomes a member the visitor record is removed.

-- The last 10 digits of a phone number: how a visitor is matched to a member whatever the format
-- ("+91 98765 43210", "09876543210" and "9876543210" are one number).
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  phone text not null,
  phone_key text not null check (length(phone_key) >= 6),
  email text,
  prayer_request text,
  -- The church's own calendar day of the first visit.
  first_visited_on date not null,
  last_visited_on date not null,
  visit_count integer not null default 1,
  -- The link in the WhatsApp message carries this, so feedback needs no sign-in.
  feedback_token uuid not null default gen_random_uuid() unique,
  feedback_sent_at timestamptz,
  -- Why the message wasn't sent (template not approved yet, no WhatsApp, ...): shown to the church.
  feedback_note text,
  rating integer check (rating between 1 and 5),
  feedback_text text,
  wants_followup boolean,
  feedback_at timestamptz,
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, phone_key)
);

create index if not exists visitors_org_idx on public.visitors (organization_id, first_visited_on desc);
create index if not exists visitors_feedback_due_idx on public.visitors (first_visited_on) where feedback_sent_at is null;

alter table public.visitors enable row level security;

-- Staff of the church can read its visitors. Everything else (the public form, feedback, the daily message,
-- marking a follow-up done) goes through the server with the service role.
drop policy if exists "Org members can view visitors" on public.visitors;
create policy "Org members can view visitors"
  on public.visitors for select to authenticated
  using (public.is_org_member(organization_id));

-- A visitor who becomes a member leaves the visitors list: when a member is added as, or approved to become,
-- an active member, any visitor of that church with the same phone number is removed.
create or replace function public.remove_visitor_when_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and public.phone_key(new.phone) <> '' then
    delete from public.visitors
    where organization_id = new.organization_id
      and phone_key = public.phone_key(new.phone);
  end if;
  return new;
end;
$$;

drop trigger if exists remove_visitor_when_member on public.members;
create trigger remove_visitor_when_member
  after insert or update of status, phone on public.members
  for each row execute function public.remove_visitor_when_member();

-- Whether an active member of the church has this phone number (compared by the last 10 digits). The public
-- visitor form uses it to tell a member that they are already part of the church. Server (service role) only.
create or replace function public.member_has_phone(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where organization_id = p_org and status = 'active' and public.phone_key(phone) = p_key
  )
$$;
revoke all on function public.member_has_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.member_has_phone(uuid, text) to service_role;

-- The daily WhatsApp feedback message is one more kind of message the system sends on its own.
alter table public.whatsapp_notice_log drop constraint if exists whatsapp_notice_log_kind_check;
alter table public.whatsapp_notice_log
  add constraint whatsapp_notice_log_kind_check
  check (kind in ('fee_request', 'fee_reminder', 'followup_member', 'followup_leader', 'visitor_feedback'));

-- Reversal (run manually if needed):
--   drop trigger if exists remove_visitor_when_member on public.members;
--   drop function if exists public.remove_visitor_when_member();
--   drop table if exists public.visitors;
--   drop function if exists public.member_has_phone(uuid, text);
--   drop function if exists public.phone_key(text);
