-- Lets any org member clear notifications from the shared list, matching
-- the existing view/mark-as-read policies (also is_org_member, not
-- admin-only). Notifications are shared org state with no per-user read
-- tracking, so clearing one clears it for the whole org — the same
-- sharing model "mark as read" already has.
drop policy if exists "Org members can delete notifications" on public.notifications;
create policy "Org members can delete notifications"
  on public.notifications
  for delete
  to authenticated
  using (public.is_org_member(organization_id));
