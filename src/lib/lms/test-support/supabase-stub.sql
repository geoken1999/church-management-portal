create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);

create table public.profiles (auth_user_id uuid primary key references auth.users (id));
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create table public.organizations (id uuid primary key default gen_random_uuid(), name text, plan text, custom_plan_limits jsonb);
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations (id), auth_user_id uuid, role text);
create table public.branches (id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations (id));
create table public.members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations (id), first_name text not null, last_name text not null, status text not null default 'active', auth_user_id uuid, branch_id uuid, phone text, email text, constraint members_status_check check (status in ('active', 'left', 'pending')));
create unique index members_organization_id_phone_key on public.members (organization_id, phone) where phone is not null;
create table public.platform_feature_flags (tab_key text primary key, enabled boolean not null default true, status text not null default 'live');
create table public.kmeet_meetings (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations (id), title text not null, status text not null default 'scheduled', mode text not null default 'video', scheduled_at timestamptz, created_by uuid);

create or replace function public.is_org_member(target_org_id uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org_id and auth_user_id = auth.uid()); $$;
create or replace function public.is_org_admin(target_org_id uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org_id and auth_user_id = auth.uid() and role in ('owner', 'admin')); $$;
create or replace function public.is_linked_member(target_org_id uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where organization_id = target_org_id and auth_user_id = auth.uid() and status = 'active'); $$;

grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- The church team's bell (only what the Bible School migrations write to it).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  type text not null default 'member_request',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
