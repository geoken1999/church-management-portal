-- Verse and lyrics projection for the live stream: an operator picks a Bible verse, a song slide or an announcement
-- and it appears on a projector page (a church screen or an OBS browser source) and in the app for members watching.
--
--   projection_screens   the church's one projector: what is on it now, how it looks, and the secret in its address
--   projection_items     the church's own songs, announcements and other slides to project
--   bible_translations   a translation the church added itself (KJV and WEB are built into the app, not stored here)
--   bible_custom_verses  the verses of those translations

create table if not exists public.projection_screens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  -- The projector page is /projector/<token>. Anyone with the address sees what is on the screen, so it is a secret
  -- the church can change at any time.
  token uuid not null unique default gen_random_uuid(),
  -- false shows a blank screen (nothing, or transparent over video).
  visible boolean not null default false,
  mode text not null default 'full' check (mode in ('full', 'lower_third')),
  -- { kind, title, text, footer } of the slide on the screen, or null.
  slide jsonb,
  -- { background, color, font } chosen by the church.
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.projection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('song', 'announcement', 'custom')),
  title text not null check (length(trim(title)) between 1 and 120),
  -- Slides are separated by a blank line.
  body text not null check (length(body) between 1 and 20000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projection_items_org_idx on public.projection_items (organization_id, kind, title);

drop trigger if exists set_projection_items_updated_at on public.projection_items;
create trigger set_projection_items_updated_at
  before update on public.projection_items
  for each row execute function public.set_updated_at();

create table if not exists public.bible_translations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_-]{2,20}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.bible_custom_verses (
  translation_id uuid not null references public.bible_translations (id) on delete cascade,
  book smallint not null check (book between 1 and 66),
  chapter smallint not null check (chapter between 1 and 150),
  verse smallint not null check (verse between 1 and 200),
  text text not null,
  primary key (translation_id, book, chapter, verse)
);

alter table public.projection_screens enable row level security;
alter table public.projection_items enable row level security;
alter table public.bible_translations enable row level security;
alter table public.bible_custom_verses enable row level security;

-- The church's team can read all of it; every change, and the public projector, go through the server (service role)
-- after the Live stream permission is checked.
drop policy if exists "Org members can view projection screens" on public.projection_screens;
create policy "Org members can view projection screens"
  on public.projection_screens for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can view projection items" on public.projection_items;
create policy "Org members can view projection items"
  on public.projection_items for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can view bible translations" on public.bible_translations;
create policy "Org members can view bible translations"
  on public.bible_translations for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can view custom bible verses" on public.bible_custom_verses;
create policy "Org members can view custom bible verses"
  on public.bible_custom_verses for select to authenticated
  using (exists (select 1 from public.bible_translations t where t.id = translation_id and public.is_org_member(t.organization_id)));

-- Reversal (run manually if needed):
--   drop table if exists public.bible_custom_verses, public.bible_translations, public.projection_items, public.projection_screens;
