-- The church team can follow a group's chat live on the web without being a member of the group.
--
-- The web chat now receives messages through Realtime (the same feed the apps use) instead of asking the server every
-- few seconds. Realtime only delivers rows the person is allowed to select, and until now only people in the group
-- were. Team logins with access to the Groups tab (owners and admins, and members of the team whose Groups
-- permission includes Read; a missing permission means read-only by design, as in tabs.ts) may now select a church's
-- group messages and groups too. This is the same access the web server already gives them.

create or replace function public.cg_team_can_view(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
     where om.organization_id = p_org
       and om.auth_user_id = auth.uid()
       and (om.role in ('owner', 'admin') or coalesce((om.tab_permissions -> 'groups' ->> 'read')::boolean, true))
  );
$$;
revoke all on function public.cg_team_can_view(uuid) from public, anon;
grant execute on function public.cg_team_can_view(uuid) to authenticated;

drop policy if exists "Team can view group messages" on public.church_group_messages;
create policy "Team can view group messages" on public.church_group_messages
  for select to authenticated using (public.cg_team_can_view(organization_id));
drop policy if exists "Team can view groups" on public.church_groups;
create policy "Team can view groups" on public.church_groups
  for select to authenticated using (public.cg_team_can_view(organization_id));

-- Reversal (run manually if needed):
--   drop policy if exists "Team can view group messages" on public.church_group_messages;
--   drop policy if exists "Team can view groups" on public.church_groups;
--   drop function if exists public.cg_team_can_view(uuid);
