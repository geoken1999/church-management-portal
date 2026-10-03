-- AI Rules: lets an org control which categories of its own data the AI
-- features (Ask Aura's tool-calling, and the Instagram/WhatsApp DM
-- auto-reply's org-context) are allowed to draw from. One row per org;
-- missing row = everything enabled (same "no row yet = default" pattern
-- as platform_feature_flags) — a brand-new org doesn't have to visit this
-- page before Ask Aura works.
create table if not exists public.ai_data_access_rules (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  allow_attendance boolean not null default true,
  allow_members boolean not null default true,
  allow_finance boolean not null default true,
  allow_fundraisers boolean not null default true,
  allow_events boolean not null default true,
  allow_ministries boolean not null default true,
  allow_branches boolean not null default true,
  allow_forms boolean not null default true,
  updated_by uuid references public.profiles (auth_user_id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_ai_data_access_rules_updated_at on public.ai_data_access_rules;
create trigger set_ai_data_access_rules_updated_at
  before update on public.ai_data_access_rules
  for each row execute function public.set_updated_at();

alter table public.ai_data_access_rules enable row level security;

-- Reads always go through the admin client in practice (webhook contexts
-- for Instagram/WhatsApp carry no session, and every org member sees the
-- same rules regardless of role) — these policies exist for completeness/
-- defense in depth, not because the app relies on them for the read path.
-- Writes ARE gated by the app layer's checkTabAccess(organizationId,
-- "airules", "write") in ai-rules/actions.ts, same as every other
-- tab-permission-gated settings page in this app.
drop policy if exists "Members can view their org's ai data access rules" on public.ai_data_access_rules;
create policy "Members can view their org's ai data access rules"
  on public.ai_data_access_rules for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create ai data access rules" on public.ai_data_access_rules;
create policy "Members can create ai data access rules"
  on public.ai_data_access_rules for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update ai data access rules" on public.ai_data_access_rules;
create policy "Members can update ai data access rules"
  on public.ai_data_access_rules for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
