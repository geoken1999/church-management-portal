-- Events module: a single "events" table drives both the Calendar and List
-- views in the dashboard. Recurrence isn't modeled as separate rows per
-- occurrence — recurring events store just their pattern (frequency +
-- optional end date), and the app expands occurrences on the fly for
-- whatever date range is being displayed.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  is_recurring boolean not null default false,
  recurrence_frequency text check (recurrence_frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_end_date date,
  managed_by uuid references public.members (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_recurrence_frequency_matches_flag check (
    (is_recurring = false and recurrence_frequency is null)
    or (is_recurring = true and recurrence_frequency is not null)
  ),
  constraint events_end_at_after_start_at check (end_at is null or end_at >= start_at)
);

create index if not exists events_organization_id_idx on public.events (organization_id);
create index if not exists events_start_at_idx on public.events (start_at);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

-- Same shape as members: any org member can add/edit day-to-day content;
-- deleting is restricted to admins as a safety net.
drop policy if exists "Org members can view events" on public.events;
create policy "Org members can view events"
  on public.events for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can add events" on public.events;
create policy "Org members can add events"
  on public.events for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Org members can update events" on public.events;
create policy "Org members can update events"
  on public.events for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
  on public.events for delete to authenticated
  using (public.is_org_admin(organization_id));
