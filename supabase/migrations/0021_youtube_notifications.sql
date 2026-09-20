-- Lets admins' own actions create notifications directly (not just the
-- member-request trigger) — used by the YouTube video upload/update/go-live
-- flows, which have no underlying table row of their own to hook a trigger
-- off, since video/broadcast data isn't cached locally at all.
drop policy if exists "Admins can create notifications" on public.notifications;
create policy "Admins can create notifications"
  on public.notifications
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));
