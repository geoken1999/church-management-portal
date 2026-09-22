-- Custom forms — a builder for registration forms/surveys with a public
-- shareable link and response collection. Field definitions live as a
-- jsonb array directly on the form row (not a separate table like
-- member_field_definitions) since a form's field set is fully custom per
-- form rather than augmenting a fixed base schema, so there's nothing to
-- join across forms.
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  description text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Array of { key, label, field_type, options, required } — field_type is
  -- one of 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'date' |
  -- 'checkbox' | 'select'; options is a string[] for 'select' only.
  fields jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  -- Denormalized from forms.organization_id purely so RLS on this table
  -- doesn't need a subquery/join to forms for every row.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forms_organization_id_idx on public.forms (organization_id);
create index if not exists form_responses_form_id_idx on public.form_responses (form_id);
create index if not exists form_responses_organization_id_idx on public.form_responses (organization_id);

drop trigger if exists set_forms_updated_at on public.forms;
create trigger set_forms_updated_at
  before update on public.forms
  for each row execute function public.set_updated_at();

alter table public.forms enable row level security;
alter table public.form_responses enable row level security;

-- forms
drop policy if exists "Members can view forms" on public.forms;
create policy "Members can view forms"
  on public.forms for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create forms" on public.forms;
create policy "Admins can create forms"
  on public.forms for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update forms" on public.forms;
create policy "Admins can update forms"
  on public.forms for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete forms" on public.forms;
create policy "Admins can delete forms"
  on public.forms for delete to authenticated
  using (public.is_org_admin(organization_id));

-- form_responses — view/delete only for org members; there's no insert
-- policy for authenticated/anon at all, since every submission goes
-- through submit_form_response (SECURITY DEFINER) below, which validates
-- required fields and the form's published status before inserting.
drop policy if exists "Members can view form responses" on public.form_responses;
create policy "Members can view form responses"
  on public.form_responses for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can delete form responses" on public.form_responses;
create policy "Admins can delete form responses"
  on public.form_responses for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Minimal public info + the field schema for a form's fill-out page.
-- Read-only, scoped to one form by slug, and only returns anything at all
-- for a published form — mirrors get_public_join_form (migration 0009),
-- so this doesn't expose the forms table (draft ones, or columns like
-- created_by/organization_id) to anon wholesale.
create or replace function public.get_public_form(form_slug text)
returns table (
  form_id uuid,
  title text,
  description text,
  fields jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select f.id, f.title, f.description, f.fields
  from public.forms f
  where f.slug = form_slug and f.status = 'published';
$$;

grant execute on function public.get_public_form(text) to anon, authenticated;

-- Public submission entry point — mirrors submit_member_request's shape
-- (migration 0024): validates against the live form definition itself
-- (published status, required fields) so a stale/tampered client can't
-- bypass either check.
create or replace function public.submit_form_response(
  form_slug text,
  answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_form record;
  new_id uuid;
  field jsonb;
begin
  select id, organization_id, fields, status
    into target_form
    from public.forms
    where slug = form_slug;

  if target_form.id is null then
    raise exception 'This form could not be found.';
  end if;

  if target_form.status <> 'published' then
    raise exception 'This form is not currently accepting responses.';
  end if;

  for field in select * from jsonb_array_elements(coalesce(target_form.fields, '[]'::jsonb))
  loop
    if coalesce((field->>'required')::boolean, false) then
      if field->>'field_type' = 'checkbox' then
        if coalesce((answers->>(field->>'key'))::boolean, false) is not true then
          raise exception '% is required.', (field->>'label');
        end if;
      elsif not (answers ? (field->>'key')) or length(trim(coalesce(answers->>(field->>'key'), ''))) = 0 then
        raise exception '% is required.', (field->>'label');
      end if;
    end if;
  end loop;

  insert into public.form_responses (form_id, organization_id, answers)
  values (target_form.id, target_form.organization_id, coalesce(answers, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_form_response(text, jsonb) to anon, authenticated;
