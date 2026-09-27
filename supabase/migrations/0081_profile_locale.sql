-- Per-user dashboard language preference — on profiles (one row per
-- auth user), not organizations, since two people on the same team can
-- each want a different language. English/Tamil/Hindi for now; the check
-- constraint is meant to grow as more languages are added
-- (src/lib/i18n/config.ts is the single source of truth on the app side —
-- keep both in sync when a new one ships).
alter table public.profiles
  add column if not exists locale text not null default 'en' check (locale in ('en', 'ta', 'hi'));
