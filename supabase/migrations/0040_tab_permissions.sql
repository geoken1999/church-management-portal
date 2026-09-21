-- Per-tab Read/Write/Delete permissions for "member"-role users. Owners and
-- admins always have full access and ignore this column entirely (enforced
-- in the app layer, not here) — it only ever constrains plain members.
-- Left null for existing rows: the app treats a null value (and any tab
-- missing from a non-null value) as read-only, the least-privilege default
-- — an admin has to explicitly grant more from the Team page.
alter table public.organization_members
  add column if not exists tab_permissions jsonb;
