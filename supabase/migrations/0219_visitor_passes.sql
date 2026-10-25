-- Visitor passes: when a guest fills in the church's visitor form they get a temporary pass, shown straight away and
-- sent to their WhatsApp number. It is an entrance token for that day: a QR code the church's team scans at the door.
-- One pass per visitor per visit day; it stops working at the end of that day (the church's own calendar day).
create table if not exists public.visitor_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visitor_id uuid not null references public.visitors (id) on delete cascade,
  -- The link in the WhatsApp message and the QR code carry this; it is unguessable.
  token uuid not null default gen_random_uuid() unique,
  -- A short code shown on the pass, for a door team that types instead of scanning.
  code text not null,
  visit_date date not null,
  valid_until timestamptz not null,
  -- Why the WhatsApp message wasn't sent (template not approved yet, no WhatsApp, ...).
  whatsapp_sent_at timestamptz,
  whatsapp_note text,
  entered_at timestamptz,
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (visitor_id, visit_date),
  unique (organization_id, code)
);

create index if not exists visitor_passes_org_idx on public.visitor_passes (organization_id, visit_date desc);

alter table public.visitor_passes enable row level security;

-- The church's team can read its passes; everything else goes through the server (service role).
drop policy if exists "Org members can view visitor passes" on public.visitor_passes;
create policy "Org members can view visitor passes"
  on public.visitor_passes for select to authenticated
  using (public.is_org_member(organization_id));

-- The WhatsApp pass message is one more kind of message the system sends on its own.
alter table public.whatsapp_notice_log drop constraint if exists whatsapp_notice_log_kind_check;
alter table public.whatsapp_notice_log
  add constraint whatsapp_notice_log_kind_check
  check (kind in ('fee_request', 'fee_reminder', 'followup_member', 'followup_leader', 'visitor_feedback', 'visitor_pass'));

-- Reversal (run manually if needed):
--   drop table if exists public.visitor_passes;
--   alter table public.whatsapp_notice_log drop constraint if exists whatsapp_notice_log_kind_check;
--   alter table public.whatsapp_notice_log add constraint whatsapp_notice_log_kind_check
--     check (kind in ('fee_request', 'fee_reminder', 'followup_member', 'followup_leader', 'visitor_feedback'));
