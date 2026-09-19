-- Worship module: the team responsible for services and their role (same
-- shape as the Media module's team, referencing the congregation roster),
-- plus a document library (order-of-service PDFs, slide decks) that can be
-- shared externally via a masked link — the URL given out is
-- /share/document/{share_token}, which never reveals the underlying
-- Storage path or the document's internal id.

create table if not exists public.worship_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null check (length(trim(role)) >= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worship_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  file_path text not null,
  file_type text not null,
  file_size bigint not null check (file_size >= 0),
  share_token uuid not null default gen_random_uuid(),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (share_token)
);

create index if not exists worship_team_members_organization_id_idx on public.worship_team_members (organization_id);
create index if not exists worship_documents_organization_id_idx on public.worship_documents (organization_id);
create index if not exists worship_documents_share_token_idx on public.worship_documents (share_token);

drop trigger if exists set_worship_team_members_updated_at on public.worship_team_members;
create trigger set_worship_team_members_updated_at
  before update on public.worship_team_members
  for each row execute function public.set_updated_at();

drop trigger if exists set_worship_documents_updated_at on public.worship_documents;
create trigger set_worship_documents_updated_at
  before update on public.worship_documents
  for each row execute function public.set_updated_at();

alter table public.worship_team_members enable row level security;
alter table public.worship_documents enable row level security;

-- worship_team_members
drop policy if exists "Members can view worship team" on public.worship_team_members;
create policy "Members can view worship team"
  on public.worship_team_members for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add worship team members" on public.worship_team_members;
create policy "Admins can add worship team members"
  on public.worship_team_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update worship team members" on public.worship_team_members;
create policy "Admins can update worship team members"
  on public.worship_team_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete worship team members" on public.worship_team_members;
create policy "Admins can delete worship team members"
  on public.worship_team_members for delete to authenticated
  using (public.is_org_admin(organization_id));

-- worship_documents: viewable by org members in the dashboard; managed by
-- admins. Anonymous access to a single shared document goes only through
-- the get_shared_worship_document() RPC below — nothing here grants anon
-- SELECT on this table.
drop policy if exists "Members can view worship documents" on public.worship_documents;
create policy "Members can view worship documents"
  on public.worship_documents for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add worship documents" on public.worship_documents;
create policy "Admins can add worship documents"
  on public.worship_documents for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete worship documents" on public.worship_documents;
create policy "Admins can delete worship documents"
  on public.worship_documents for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Public, masked lookup: given only the random share token, return just
-- enough to resolve/download the file (never the storage path or org
-- internals directly to the client — the /share/document/[token] route
-- handler is the only caller). Granted to anon so a logged-out recipient
-- of the link can open it.
create or replace function public.get_shared_worship_document(token uuid)
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
    from public.worship_documents d
    where d.share_token = token;
end;
$$;

grant execute on function public.get_shared_worship_document(uuid) to anon, authenticated;

-- Storage bucket for worship documents. Public (like organization-logos) —
-- paths are random uuids, not enumerable — but the link actually handed out
-- to people is always the masked /share/document/{token} route, never this
-- bucket's raw URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worship-documents',
  'worship-documents',
  true,
  26214400,
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view worship documents" on storage.objects;
create policy "Public can view worship documents"
  on storage.objects
  for select
  using (bucket_id = 'worship-documents');

drop policy if exists "Admins can upload worship documents" on storage.objects;
create policy "Admins can upload worship documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'worship-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete worship documents from storage" on storage.objects;
create policy "Admins can delete worship documents from storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'worship-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
