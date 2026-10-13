-- Advanced reports (builds on 0167): annual reports as well as monthly ones, reports
-- for one branch or the whole church, a language (English, Tamil or Hindi), photos,
-- and reusable report templates. The AI-written summary, the church's letterhead and
-- the translated headings are saved inside each report's data.

alter table public.monthly_reports
  add column if not exists kind text not null default 'monthly' check (kind in ('monthly', 'annual')),
  add column if not exists branch_id uuid references public.branches (id) on delete cascade,
  add column if not exists language text not null default 'en' check (language in ('en', 'ta', 'hi'));

-- 'YYYY-MM' for a monthly report, 'YYYY' for an annual one.
alter table public.monthly_reports drop constraint if exists monthly_reports_period_check;
alter table public.monthly_reports add constraint monthly_reports_period_check check (period ~ '^\d{4}(-(0[1-9]|1[0-2]))?$');

-- One report per church, period and branch (or for the whole church).
alter table public.monthly_reports drop constraint if exists monthly_reports_organization_id_period_key;
create unique index if not exists monthly_reports_unique_idx
  on public.monthly_reports (organization_id, period, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Members see the church-wide reports, and the reports of their own branch.
create or replace function public.get_published_reports()
returns table (id uuid, period text, title text, note text, data jsonb, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.period, r.title, r.note, r.data, r.created_at
    from public.monthly_reports r
    join public.members m on m.organization_id = r.organization_id and m.auth_user_id = auth.uid() and m.status = 'active'
   where r.published
     and (r.branch_id is null or r.branch_id = m.branch_id)
   order by r.period desc, r.created_at desc
   limit 48;
$$;

grant execute on function public.get_published_reports() to authenticated;

-- Saved report templates: sections, language, AI summary and letterhead a church reuses.
create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.report_templates enable row level security;

drop policy if exists "Team members can view report templates" on public.report_templates;
create policy "Team members can view report templates"
  on public.report_templates for select to authenticated
  using (public.is_org_member(organization_id));
-- Writes go through the server, which checks the Reports tab's permission.

-- Photos added to a report live in their own bucket, one folder per church.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-images', 'report-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Report photos count towards the church's storage (same function as 0051, plus the bucket).
create or replace function public.get_organization_storage_bytes(target_org_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_org_id) then
    raise exception 'Not authorized';
  end if;

  return (
    select coalesce(sum((metadata->>'size')::bigint), 0)
    from storage.objects
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents', 'report-images')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

-- AI usage can now come from a report.
alter table public.ai_reply_usage drop constraint if exists ai_reply_usage_source_check;
alter table public.ai_reply_usage add constraint ai_reply_usage_source_check check (source in ('instagram', 'ask_aura', 'whatsapp', 'report'));

-- Reversal (run manually if needed):
--   drop table if exists public.report_templates;
--   drop index if exists public.monthly_reports_unique_idx;
--   alter table public.monthly_reports drop column if exists language, drop column if exists branch_id, drop column if exists kind;
