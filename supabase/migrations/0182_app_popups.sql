-- Popups for the members' mobile app: a message that opens over the app when a member opens it,
-- with an optional button that opens a link. Admins manage them under Mobile App -> Popups; the
-- server writes (service role), members' apps read the live ones.
create table if not exists public.app_popups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  message text not null default '',
  -- Optional button: both set, or neither. link_url is always https.
  button_label text,
  link_url text,
  -- Shown from starts_at until ends_at (open-ended when null), while is_active.
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  -- false: a member sees it once (until they close it); true: every time they open the app.
  show_every_time boolean not null default false,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_popups_org_idx on public.app_popups (organization_id, created_at desc);

alter table public.app_popups enable row level security;

drop policy if exists "Admins can view their church's popups" on public.app_popups;
create policy "Admins can view their church's popups"
  on public.app_popups for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Linked members can view live popups" on public.app_popups;
create policy "Linked members can view live popups"
  on public.app_popups for select to authenticated
  using (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and public.is_linked_member(organization_id)
  );

-- Reversal (run manually if needed):
--   drop table if exists public.app_popups;
