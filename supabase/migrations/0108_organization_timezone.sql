-- No per-org timezone has ever existed in this schema. Event capture
-- resolves against whoever's browser is typing, server-rendered emails
-- resolve against the Node runtime's own timezone (UTC on Vercel), and
-- every date-sensitive cron/automation hardcodes Asia/Kolkata. Defaulting
-- every existing org to Asia/Kolkata here preserves current behavior
-- exactly until an org explicitly changes it.
alter table public.organizations
  add column if not exists timezone text not null default 'Asia/Kolkata';

-- Re-created (same signature as migration 0076) to also expose the org's
-- timezone — the public registration page needs it to format the event's
-- start time correctly instead of defaulting to whatever timezone the
-- rendering runtime happens to be in (previously a real hydration-mismatch
-- risk too: server and browser can disagree on "local" time).
drop function if exists public.get_public_event_registration(uuid);
create function public.get_public_event_registration(token uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  registration_fields jsonb,
  registration_closes_at timestamptz,
  spots_remaining integer,
  is_open boolean,
  status text,
  organization_name text,
  organization_logo_url text,
  organization_timezone text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.description,
    e.start_at,
    e.end_at,
    e.registration_fields,
    e.registration_closes_at,
    case
      when e.registration_capacity is null then null
      else greatest(0, e.registration_capacity - (
        select count(*)::int from public.event_registrations r
        where r.event_id = e.id and r.status <> 'cancelled'
      ))
    end,
    (
      e.status = 'active'
      and (e.registration_closes_at is null or now() <= e.registration_closes_at)
      and (
        (e.is_recurring and e.recurrence_frequency is not null)
        or now() <= e.start_at - interval '1 hour'
      )
      and (
        e.registration_capacity is null
        or (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.registration_capacity
      )
    ),
    e.status,
    o.name,
    o.logo_url,
    o.timezone
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.registration_share_token = token and e.registration_enabled = true;
$$;

grant execute on function public.get_public_event_registration(uuid) to anon, authenticated;
