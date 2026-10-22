-- Live updates for family requests (0209): admins see a new request the moment it is
-- sent, and the member sees "approved" / "not approved" the moment it is reviewed.
-- Realtime only tells a person about rows their Row Level Security lets them read, so
-- the member needs a policy for their own requests.
drop policy if exists "Members can view their own family requests" on public.family_requests;
create policy "Members can view their own family requests"
  on public.family_requests for select to authenticated
  using (exists (select 1 from public.members where id = requested_by and auth_user_id = auth.uid()));

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['family_requests', 'families', 'family_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Reversal (run manually if needed):
--   drop policy if exists "Members can view their own family requests" on public.family_requests;
--   alter publication supabase_realtime drop table public.family_requests;
