-- Popups can carry an image. Images live in a public bucket (the members' apps show them by
-- link); only the server uploads, using the service role.
alter table public.app_popups add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-popup-images', 'app-popup-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Reversal (run manually if needed):
--   alter table public.app_popups drop column if exists image_url;
--   delete from storage.buckets where id = 'app-popup-images';
