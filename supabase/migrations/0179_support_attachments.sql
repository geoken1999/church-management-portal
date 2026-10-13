-- Screenshots on support tickets and replies. The files are kept in a private bucket and shown
-- through short-lived links, so only the church's team and Super Admin can ever see them.
alter table public.support_tickets add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.support_ticket_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Reversal (run manually if needed):
--   alter table public.support_tickets drop column if exists attachments;
--   alter table public.support_ticket_messages drop column if exists attachments;
