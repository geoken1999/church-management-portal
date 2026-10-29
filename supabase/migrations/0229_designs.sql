-- Flyer / poster designer (under the Media tab). A design is a page size plus a JSON document of elements.
-- Designs can embed pictures, so rows can be large; they are read and written only by the server after it has
-- checked the person's Media access, never straight from a browser session (RLS on, no policies).

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 1),
  kind text not null default 'custom' check (kind in ('flyer', 'poster', 'social', 'custom')),
  width integer not null check (width between 100 and 4000),
  height integer not null check (height between 100 and 4000),
  doc jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists designs_organization_updated_idx on public.designs (organization_id, updated_at desc);

drop trigger if exists set_designs_updated_at on public.designs;
create trigger set_designs_updated_at before update on public.designs
  for each row execute function public.set_updated_at();

alter table public.designs enable row level security;
