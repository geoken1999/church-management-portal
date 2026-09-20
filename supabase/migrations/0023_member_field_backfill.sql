-- Backfills a value onto existing member records that don't have it set —
-- used when an admin marks a custom field required (on creation or by
-- editing an existing field) while the org already has members without a
-- value for it. Only touches rows missing the key (the ? jsonb operator),
-- so it never overwrites a value a member already has.
--
-- No SECURITY DEFINER needed: this runs as the calling user, and the
-- existing "Org members can update members" RLS policy (is_org_member)
-- already permits this — the same policy that lets the normal edit-member
-- flow update custom_fields freely.
create or replace function public.backfill_member_custom_field(
  p_organization_id uuid,
  p_key text,
  p_value jsonb
)
returns void
language plpgsql
as $$
begin
  update public.members
  set custom_fields = coalesce(custom_fields, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
  where organization_id = p_organization_id
    and not (custom_fields ? p_key);
end;
$$;

grant execute on function public.backfill_member_custom_field(uuid, text, jsonb) to authenticated;
