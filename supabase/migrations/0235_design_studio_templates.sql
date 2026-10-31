-- Design Studio 2.0, phase 1: a managed template library, favourites, and a trash for designs.
-- Templates belong to the platform (not to one church), are managed by super admins, and are read through the
-- server only (RLS on, no policies), like `designs`. Favourites are per person per church.

create table if not exists public.design_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  group_name text not null check (length(trim(group_name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.design_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,100}$'),
  title text not null check (length(trim(title)) between 1 and 120),
  category_id uuid not null references public.design_categories (id) on delete restrict,
  width integer not null check (width between 100 and 4000),
  height integer not null check (height between 100 and 4000),
  tags text[] not null default '{}',
  is_premium boolean not null default false,
  published boolean not null default false,
  popularity integer not null default 0,
  -- Set by super admins; "recommended" sorts by this first.
  featured_rank integer not null default 0,
  doc jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_templates_published_idx on public.design_templates (published, category_id, updated_at desc);
create index if not exists design_templates_popularity_idx on public.design_templates (popularity desc);

drop trigger if exists set_design_templates_updated_at on public.design_templates;
create trigger set_design_templates_updated_at before update on public.design_templates
  for each row execute function public.set_updated_at();

create table if not exists public.design_favorites (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.design_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, template_id)
);

alter table public.designs add column if not exists deleted_at timestamptz;
alter table public.designs add column if not exists template_id uuid references public.design_templates (id) on delete set null;
create index if not exists designs_organization_deleted_idx on public.designs (organization_id, deleted_at);

alter table public.design_categories enable row level security;
alter table public.design_templates enable row level security;
alter table public.design_favorites enable row level security;
