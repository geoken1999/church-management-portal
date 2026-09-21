-- Prevents two members in the same organization from sharing a phone
-- number. Partial (phone is not null) so members with no phone on file
-- don't collide with each other.
create unique index if not exists members_organization_id_phone_key
  on public.members (organization_id, phone)
  where phone is not null;
