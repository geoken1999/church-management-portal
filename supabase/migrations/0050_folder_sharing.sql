-- Folder sharing: categories to group documents (and, later, to scope what
-- a logged-in member can see once member login exists), plus opt-in masked
-- share links — same /share/{token} convention as worship_documents
-- (migration 0015), except the shared-documents bucket stays PRIVATE, so
-- the share routes mint a short-lived signed URL server-side instead of
-- reading a public bucket URL. Nothing here is exposed until an admin
-- explicitly flips share_enabled — uploads stay fully private by default,
-- matching the existing "Private — visible only to people granted access"
-- behavior.
create table if not exists public.folder_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  share_token uuid not null default gen_random_uuid(),
  share_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (share_token)
);

create index if not exists folder_categories_organization_id_idx on public.folder_categories (organization_id);

alter table public.shared_documents
  add column if not exists category_id uuid references public.folder_categories (id) on delete set null,
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists share_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_documents_share_token_key'
  ) then
    alter table public.shared_documents add constraint shared_documents_share_token_key unique (share_token);
  end if;
end $$;

create index if not exists shared_documents_category_id_idx on public.shared_documents (category_id);

-- Belt-and-braces: category_id must belong to the same org as the document
-- itself. Without this, a document could be filed under another org's
-- category and leak through that org's category share link (the RPCs above
-- also guard against this, but this closes the hole for every write path,
-- not just the app's own action functions).
create or replace function public.check_shared_document_category_org()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.folder_categories c
    where c.id = new.category_id and c.organization_id = new.organization_id
  ) then
    raise exception 'category_id must belong to the same organization as the document';
  end if;
  return new;
end;
$$;

drop trigger if exists check_shared_document_category_org on public.shared_documents;
create trigger check_shared_document_category_org
  before insert or update of category_id, organization_id on public.shared_documents
  for each row execute function public.check_shared_document_category_org();

drop trigger if exists set_folder_categories_updated_at on public.folder_categories;
create trigger set_folder_categories_updated_at
  before update on public.folder_categories
  for each row execute function public.set_updated_at();

alter table public.folder_categories enable row level security;

-- Same floor as shared_documents itself: RLS only guarantees org-admin
-- read/write; the tab permissions matrix (checkTabAccess, "folder") is what
-- actually decides which staff members can manage categories in the app.
drop policy if exists "Members can view folder categories" on public.folder_categories;
create policy "Members can view folder categories"
  on public.folder_categories for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add folder categories" on public.folder_categories;
create policy "Admins can add folder categories"
  on public.folder_categories for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update folder categories" on public.folder_categories;
create policy "Admins can update folder categories"
  on public.folder_categories for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete folder categories" on public.folder_categories;
create policy "Admins can delete folder categories"
  on public.folder_categories for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Public, masked lookup for a single shared document. Mirrors
-- get_shared_worship_document, but additionally requires share_enabled —
-- Folder links are opt-in per document, unlike worship's always-on links.
create or replace function public.get_shared_document(token uuid)
returns table (
  title text,
  file_path text,
  file_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select d.title, d.file_path, d.file_type
    from public.shared_documents d
    where d.share_token = token
      and d.share_enabled = true;
end;
$$;

grant execute on function public.get_shared_document(uuid) to anon, authenticated;

-- Public, masked lookup for a category link — returns the category name
-- only when the admin has enabled sharing on that category.
create or replace function public.get_shared_category(token uuid)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select c.id, c.name
    from public.folder_categories c
    where c.share_token = token
      and c.share_enabled = true;
end;
$$;

grant execute on function public.get_shared_category(uuid) to anon, authenticated;

-- Lists every document in a shared category. Enabling the category link is
-- itself the opt-in for all documents currently (and later) assigned to
-- it — this does not depend on each document's own share_enabled flag.
create or replace function public.get_shared_category_documents(token uuid)
returns table (
  id uuid,
  title text,
  file_type text,
  file_size bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select d.id, d.title, d.file_type, d.file_size, d.created_at
    from public.shared_documents d
    join public.folder_categories c on c.id = d.category_id and c.organization_id = d.organization_id
    where c.share_token = token
      and c.share_enabled = true
    order by d.created_at desc;
end;
$$;

grant execute on function public.get_shared_category_documents(uuid) to anon, authenticated;

-- Resolves one file within a shared category — used by the category
-- download route. Re-checks both the category token/enabled state and that
-- the document actually belongs to that category, so a stale or guessed
-- document id from a different org can't be pulled through a valid token.
create or replace function public.get_shared_category_document(token uuid, doc_id uuid)
returns table (
  title text,
  file_path text,
  file_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select d.title, d.file_path, d.file_type
    from public.shared_documents d
    join public.folder_categories c on c.id = d.category_id and c.organization_id = d.organization_id
    where c.share_token = token
      and c.share_enabled = true
      and d.id = doc_id;
end;
$$;

grant execute on function public.get_shared_category_document(uuid, uuid) to anon, authenticated;
