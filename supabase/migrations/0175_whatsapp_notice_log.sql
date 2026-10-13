-- WhatsApp messages the system sends on its own (membership fee requests and reminders,
-- member follow-up). One row per message: it stops the same message going twice, and it is
-- counted against the church's monthly WhatsApp allowance like a campaign message.
create table if not exists public.whatsapp_notice_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('fee_request', 'fee_reminder', 'followup_member', 'followup_leader')),
  -- What it is about: the invoice, the follow-up task, or the automation run.
  ref_id uuid not null,
  recipient text not null,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  wamid text,
  error text,
  created_at timestamptz not null default now(),
  unique (kind, ref_id, recipient)
);

create index if not exists whatsapp_notice_log_org_idx on public.whatsapp_notice_log (organization_id, created_at desc);

-- Written and read by the server only.
alter table public.whatsapp_notice_log enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.whatsapp_notice_log;
