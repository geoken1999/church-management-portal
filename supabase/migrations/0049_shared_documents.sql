-- Folder — a general-purpose, access-controlled document repository
-- (distinct from worship_documents/media_documents, which live in PUBLIC
-- buckets meant for outside sharing via a masked token link). This bucket
-- is private: nobody gets a working URL to a file without going through
-- getFolderDownloadUrl (src/lib/folder/actions.ts), which checks the tab
-- permissions matrix and only then mints a short-lived signed URL with
-- the admin client. RLS here is just the floor (is_org_admin), same as
-- every other admin-by-default module — the tab permissions matrix is
-- what actually decides which members get read/write/delete.
create table if not exists public.shared_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  file_path text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_documents_organization_id_idx on public.shared_documents (organization_id);

-- A second FK (alongside the one to auth.users above) purely so PostgREST
-- can embed `profiles` through shared_documents in a single query — same
-- pattern as support_tickets_profile_fk in migration 0046.
alter table public.shared_documents
  drop constraint if exists shared_documents_profile_fk,
  add constraint shared_documents_profile_fk
    foreign key (uploaded_by) references public.profiles (auth_user_id) on delete set null;

drop trigger if exists set_shared_documents_updated_at on public.shared_documents;
create trigger set_shared_documents_updated_at
  before update on public.shared_documents
  for each row execute function public.set_updated_at();

alter table public.shared_documents enable row level security;

drop policy if exists "Members can view shared documents" on public.shared_documents;
create policy "Members can view shared documents"
  on public.shared_documents for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can upload shared documents" on public.shared_documents;
create policy "Admins can upload shared documents"
  on public.shared_documents for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete shared documents" on public.shared_documents;
create policy "Admins can delete shared documents"
  on public.shared_documents for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Private bucket — no "public can view" policy at all, unlike
-- worship-documents/media-documents. Every read goes through a signed URL
-- minted server-side after an app-layer permission check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-documents',
  'shared-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Admins can upload to shared documents storage" on storage.objects;
create policy "Admins can upload to shared documents storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'shared-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete from shared documents storage" on storage.objects;
create policy "Admins can delete from shared documents storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'shared-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
