-- WhatsApp templates can have an image header and up to three buttons.
--
-- Meta fetches the header image when a message is sent, so it's stored in a
-- public bucket. The bucket accepts only JPEG and PNG, up to 5 MB, and clients
-- can't write to it: uploads come from the server (service role). Images are
-- non-sensitive marketing/notice artwork.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-template-headers', 'whatsapp-template-headers', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

alter table public.whatsapp_templates
  add column if not exists header_type text not null default 'none' check (header_type in ('none', 'image')),
  add column if not exists header_image_path text null,
  add column if not exists buttons jsonb not null default '[]'::jsonb check (jsonb_typeof(buttons) = 'array');

-- Reversal (run manually if needed):
--   alter table public.whatsapp_templates drop column if exists buttons, drop column if exists header_image_path, drop column if exists header_type;
--   delete from storage.buckets where id = 'whatsapp-template-headers';
