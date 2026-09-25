-- Website widget — an embeddable "capture a query" bubble a church can drop
-- onto their own external website via a tiny loader script (see
-- src/app/widget/loader.js/route.ts). One widget per organization (unlike
-- forms, which can have many), addressed publicly by an opaque share_token
-- rather than a slug, since it's never meant to be typed/shared as a
-- memorable URL — only ever embedded via the loader.
create table if not exists public.website_widgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  share_token uuid not null unique default gen_random_uuid(),
  enabled boolean not null default true,
  primary_color text not null default '#7c3aed',
  "position" text not null default 'bottom-right' check ("position" in ('bottom-right', 'bottom-left')),
  button_label text not null default 'Chat with us' check (length(trim(button_label)) >= 1),
  greeting_title text not null default 'Get in touch' check (length(trim(greeting_title)) >= 1),
  greeting_message text not null default 'Have a question? Send us a message and we''ll get back to you.',
  -- Same shape as forms.fields (migration 0048): { key, label, field_type,
  -- options, required }[] — defaults to a standard name/email/phone/message
  -- set on creation, but stays fully editable like a form's fields.
  fields jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.widget_submissions (
  id uuid primary key default gen_random_uuid(),
  widget_id uuid not null references public.website_widgets (id) on delete cascade,
  -- Denormalized from website_widgets.organization_id, same reasoning as
  -- form_responses.organization_id — avoids a join to website_widgets for
  -- RLS on every row.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  page_url text,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists website_widgets_organization_id_idx on public.website_widgets (organization_id);
create index if not exists widget_submissions_widget_id_idx on public.widget_submissions (widget_id);
create index if not exists widget_submissions_organization_id_idx on public.widget_submissions (organization_id);

drop trigger if exists set_website_widgets_updated_at on public.website_widgets;
create trigger set_website_widgets_updated_at
  before update on public.website_widgets
  for each row execute function public.set_updated_at();

-- Defense-in-depth: widget_submissions.organization_id must always match
-- its parent widget's organization_id, same pattern as
-- check_whatsapp_message_org (migration 0058).
create or replace function public.check_widget_submission_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.website_widgets w where w.id = new.widget_id and w.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the parent widget''s organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_widget_submission_org on public.widget_submissions;
create trigger check_widget_submission_org
  before insert or update of widget_id, organization_id on public.widget_submissions
  for each row execute function public.check_widget_submission_org();

alter table public.website_widgets enable row level security;
alter table public.widget_submissions enable row level security;

-- website_widgets — admin floor, same as forms/accounting: designing the
-- widget (branding, fields) is a configuration action, not day-to-day work.
drop policy if exists "Members can view website widget" on public.website_widgets;
create policy "Members can view website widget"
  on public.website_widgets for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create website widget" on public.website_widgets;
create policy "Admins can create website widget"
  on public.website_widgets for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update website widget" on public.website_widgets;
create policy "Admins can update website widget"
  on public.website_widgets for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete website widget" on public.website_widgets;
create policy "Admins can delete website widget"
  on public.website_widgets for delete to authenticated
  using (public.is_org_admin(organization_id));

-- widget_submissions — view/delete only for org members; there's no insert
-- policy for authenticated/anon at all, since every submission goes
-- through submit_widget_response (SECURITY DEFINER) below, mirroring
-- submit_form_response's approach exactly.
drop policy if exists "Members can view widget submissions" on public.widget_submissions;
create policy "Members can view widget submissions"
  on public.widget_submissions for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can update widget submissions" on public.widget_submissions;
create policy "Members can update widget submissions"
  on public.widget_submissions for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins can delete widget submissions" on public.widget_submissions;
create policy "Admins can delete widget submissions"
  on public.widget_submissions for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Minimal public info for the embedded widget iframe — read-only, scoped
-- by share_token, and only returns anything for an enabled widget. Mirrors
-- get_public_form (migration 0048); doesn't expose organization_id or
-- created_by to anon.
create or replace function public.get_public_widget(token uuid)
returns table (
  widget_id uuid,
  primary_color text,
  "position" text,
  button_label text,
  greeting_title text,
  greeting_message text,
  fields jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select w.id, w.primary_color, w."position", w.button_label, w.greeting_title, w.greeting_message, w.fields
  from public.website_widgets w
  where w.share_token = token and w.enabled = true;
$$;

grant execute on function public.get_public_widget(uuid) to anon, authenticated;

-- Public submission entry point — mirrors submit_form_response's shape
-- exactly (validates required fields against the live widget definition,
-- and that the widget is still enabled, so a stale/tampered embed can't
-- bypass either check).
create or replace function public.submit_widget_response(
  token uuid,
  answers jsonb,
  page_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_widget record;
  new_id uuid;
  field jsonb;
begin
  select id, organization_id, fields, enabled
    into target_widget
    from public.website_widgets
    where share_token = token;

  if target_widget.id is null then
    raise exception 'This widget could not be found.';
  end if;

  if not target_widget.enabled then
    raise exception 'This widget is not currently accepting messages.';
  end if;

  for field in select * from jsonb_array_elements(coalesce(target_widget.fields, '[]'::jsonb))
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

  insert into public.widget_submissions (widget_id, organization_id, answers, page_url)
  values (target_widget.id, target_widget.organization_id, coalesce(answers, '{}'::jsonb), page_url)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_widget_response(uuid, jsonb, text) to anon, authenticated;
