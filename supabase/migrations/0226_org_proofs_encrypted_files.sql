-- Proof documents are now encrypted by the server before they are kept (src/lib/organizations/proof-crypto.ts), so the
-- stored file is opaque bytes. The bucket has to accept that type alongside the original upload types.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream']
  where id = 'org-proofs';

-- Rollback:
--   update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] where id = 'org-proofs';
