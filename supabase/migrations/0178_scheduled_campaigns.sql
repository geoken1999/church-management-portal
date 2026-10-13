-- Scheduled campaigns: an email, SMS or WhatsApp campaign saved to be sent at a chosen time.
-- A job that runs every few minutes (see supabase/setup/scheduled-campaigns-cron.sql) sends
-- what is due, then records how it went. Only the server writes to this table.
create table if not exists public.scheduled_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  -- Exactly what will be sent: subject and body, or the template and its values, and the recipients.
  payload jsonb not null,
  -- Email attachments, kept in the scheduled-campaign-files bucket until the campaign goes out.
  attachments jsonb not null default '[]'::jsonb,
  -- A short line for the list: the subject, the start of the message, or the template's name.
  summary text not null default '',
  recipient_count integer not null default 0,
  -- How it went: counts, or the reason it didn't go out.
  result jsonb,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists scheduled_campaigns_due_idx on public.scheduled_campaigns (scheduled_at) where status = 'scheduled';
create index if not exists scheduled_campaigns_org_idx on public.scheduled_campaigns (organization_id, scheduled_at desc);

alter table public.scheduled_campaigns enable row level security;

drop policy if exists "Team can view their church's scheduled campaigns" on public.scheduled_campaigns;
create policy "Team can view their church's scheduled campaigns"
  on public.scheduled_campaigns for select to authenticated
  using (public.is_org_member(organization_id));

-- Private: attachments are only read by the server when the campaign is sent.
insert into storage.buckets (id, name, public, file_size_limit)
values ('scheduled-campaign-files', 'scheduled-campaign-files', false, 5242880)
on conflict (id) do nothing;

-- Reversal (run manually if needed):
--   drop table if exists public.scheduled_campaigns;
