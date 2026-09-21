-- Media ministry document library — equipment manuals, guidelines, and
-- other files that don't fit the worship module's PDF/PowerPoint-only,
-- externally-shareable documents. No masked share-token link here (unlike
-- worship_documents); this is an internal team resource list, so direct
-- access is fine.
create table if not exists public.media_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  file_path text not null,
  file_type text not null,
  file_size integer not null,
  uploaded_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists media_documents_organization_id_idx
  on public.media_documents (organization_id);

alter table public.media_documents enable row level security;

-- Same permission shape as media_equipment/media_team_members/
-- media_social_accounts: any member can view, only admins can manage.
drop policy if exists "Members can view media documents" on public.media_documents;
create policy "Members can view media documents"
  on public.media_documents for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can upload media documents" on public.media_documents;
create policy "Admins can upload media documents"
  on public.media_documents for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete media documents" on public.media_documents;
create policy "Admins can delete media documents"
  on public.media_documents for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Public bucket (same reasoning as worship-documents/email-images) —
-- broader mime-type allowlist than worship's PDF/PowerPoint-only, since
-- this is meant for "documents of all kinds", but still excludes
-- executables/HTML/SVG for safety (SVGs can carry inline scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-documents',
  'media-documents',
  true,
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

drop policy if exists "Public can view media documents" on storage.objects;
create policy "Public can view media documents"
  on storage.objects
  for select
  using (bucket_id = 'media-documents');

drop policy if exists "Admins can upload media documents to storage" on storage.objects;
create policy "Admins can upload media documents to storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete media documents from storage" on storage.objects;
create policy "Admins can delete media documents from storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- Extend the storage-quota aggregate (0030) to also count this bucket —
-- same function signature, just a wider bucket_id list, so this is safe
-- to replace in place without a drop.
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
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;
