-- Proof document for a church (registration certificate), checked by the platform admin.
--
-- A church gets 2 minutes from the first time it opens the dashboard to upload its document. Without one (or after a
-- rejection) the money and messaging features stay closed; the Profile page always stays open so it can be uploaded.
-- Existing churches start as 'not_submitted' too; the platform admin can mark a church verified without a document.
alter table public.organizations
  add column if not exists verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'under_review', 'verified', 'rejected')),
  add column if not exists verification_started_at timestamptz,
  add column if not exists proof_document_path text,
  add column if not exists proof_document_name text,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz;

create index if not exists organizations_proof_review_idx
  on public.organizations (proof_submitted_at)
  where verification_status = 'under_review';

-- Private bucket: nobody reads these directly. Uploads use signed upload links the server makes for the church's own
-- folder; the platform admin opens a document through a short-lived signed link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-proofs', 'org-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Rollback:
--   delete from storage.buckets where id = 'org-proofs';
--   alter table public.organizations drop column if exists verification_status, drop column if exists verification_started_at,
--     drop column if exists proof_document_path, drop column if exists proof_document_name,
--     drop column if exists proof_submitted_at, drop column if exists verification_note, drop column if exists verified_at;
