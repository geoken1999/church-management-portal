-- Every member of a church can see which social accounts it has connected
-- (name and picture), not only admins. The connection tables themselves stay
-- admin-only, because they hold access tokens.
--
-- This function returns only the public-safe columns, and only to members of
-- the organization it's asked about.

create or replace function public.organization_social_accounts(p_organization_id uuid)
returns table (platform text, account_name text, picture_url text, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select 'instagram'::text, i.username, i.profile_picture_url, i.is_active
    from public.instagram_connections i
    where i.organization_id = p_organization_id and public.is_org_member(p_organization_id)
  union all
  select 'youtube'::text, y.channel_title, y.thumbnail_url, y.is_active
    from public.youtube_connections y
    where y.organization_id = p_organization_id and public.is_org_member(p_organization_id)
  union all
  select 'facebook'::text, f.page_name, f.page_picture_url, true
    from public.facebook_connections f
    where f.organization_id = p_organization_id and public.is_org_member(p_organization_id);
$$;

revoke execute on function public.organization_social_accounts(uuid) from public, anon;
grant execute on function public.organization_social_accounts(uuid) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.organization_social_accounts(uuid);
