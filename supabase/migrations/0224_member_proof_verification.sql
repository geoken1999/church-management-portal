-- Proof of identity for people who create their own profile (the church's public join form).
--
-- A self-registered person may now open the app straight away. They get 2 minutes (from the first time the app asks)
-- to upload a proof document; until the church verifies it, or while no proof has been sent, some features are limited.
-- Members the church adds itself are untouched: they start as 'verified'.
alter table public.members
  add column if not exists self_registered boolean not null default false,
  add column if not exists verification_status text not null default 'verified'
    check (verification_status in ('not_submitted', 'under_review', 'verified', 'rejected')),
  add column if not exists verification_started_at timestamptz,
  add column if not exists proof_document_path text,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz;

create index if not exists members_proof_review_idx
  on public.members (organization_id)
  where self_registered and verification_status = 'under_review';

-- Private bucket: proof documents are identity documents, so nobody reads them directly. Uploads use signed upload
-- links made by the server for the member's own folder; the church sees them through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-proofs', 'member-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Rollback:
--   delete from storage.buckets where id = 'member-proofs';
--   alter table public.members drop column if exists self_registered, drop column if exists verification_status,
--     drop column if exists verification_started_at, drop column if exists proof_document_path,
--     drop column if exists proof_submitted_at, drop column if exists verification_note, drop column if exists verified_at;
