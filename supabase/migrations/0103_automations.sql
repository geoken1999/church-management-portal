-- Automation module, Feature 01: WhatsApp Birthday & Anniversary Bot.
--
-- WhatsApp group messaging is not possible with this app's integration
-- (Meta's Business Cloud API has no group-send capability at all, by
-- design — confirmed, no workaround exists), so "destination" here means
-- either a direct 1:1 message to the celebrated member, or a digest sent
-- to a fixed list of staff numbers (automation_destinations.kind). Both
-- still require a pre-approved Meta template for any proactive send, so
-- automation_templates stores a human-authored NAMED-variable body
-- ({{first_name}}) plus the name->position mapping needed to submit a
-- positional ({{1}}) body to Meta and to reconstruct bodyParams at send
-- time. This is a separate table from whatsapp_templates (the existing
-- campaign-template system) by deliberate choice, not duplication —  that
-- system's positional-only UI isn't the editing experience wanted here.
--
-- Schema is kept generic enough to host a second automation "type" later
-- without a new migration (automations.type is a check-constrained enum
-- with one value so far) per the brief: build the framework, ship one bot.

create table if not exists public.automation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meta_template_name text not null check (meta_template_name ~ '^[a-z0-9_]+$'),
  language text not null default 'en_US',
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  -- Human-authored body using {{first_name}}-style named placeholders.
  body_text_named text not null check (length(trim(body_text_named)) >= 1),
  -- Extracted names in first-occurrence order — variable_names[0] is
  -- Meta's {{1}}, variable_names[1] is {{2}}, etc. This array IS the
  -- name->position mapping; there is no separate mapping column.
  variable_names text[] not null default '{}',
  -- member_direct templates resolve per-member variables (first_name,
  -- church_name, occasion_label, ...); staff_digest templates take
  -- exactly one variable, celebrant_list. Enforced in TS validation, not
  -- a CHECK, matching how whatsapp/validation.ts owns this kind of rule.
  kind text not null check (kind in ('member_direct', 'staff_digest')),
  meta_template_id text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected', 'paused', 'disabled')),
  rejected_reason text,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_template_name)
);

create index if not exists automation_templates_organization_id_idx on public.automation_templates (organization_id);

drop trigger if exists set_automation_templates_updated_at on public.automation_templates;
create trigger set_automation_templates_updated_at
  before update on public.automation_templates
  for each row execute function public.set_updated_at();

alter table public.automation_templates enable row level security;

drop policy if exists "Org members can view automation templates" on public.automation_templates;
create policy "Org members can view automation templates"
  on public.automation_templates
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Admin-only write, same bar as whatsapp_templates: a bad template
-- affects deliverability on the one shared WhatsApp number for everyone.
drop policy if exists "Admins can add automation templates" on public.automation_templates;
create policy "Admins can add automation templates"
  on public.automation_templates
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update automation templates" on public.automation_templates;
create policy "Admins can update automation templates"
  on public.automation_templates
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete automation templates" on public.automation_templates;
create policy "Admins can delete automation templates"
  on public.automation_templates
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null default 'birthday_anniversary' check (type in ('birthday_anniversary')),
  name text not null check (length(trim(name)) >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  updated_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automations_organization_id_idx on public.automations (organization_id);

drop trigger if exists set_automations_updated_at on public.automations;
create trigger set_automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

alter table public.automations enable row level security;

drop policy if exists "Org members can view automations" on public.automations;
create policy "Org members can view automations"
  on public.automations
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add automations" on public.automations;
create policy "Admins can add automations"
  on public.automations
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update automations" on public.automations;
create policy "Admins can update automations"
  on public.automations
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete automations" on public.automations;
create policy "Admins can delete automations"
  on public.automations
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create table if not exists public.automation_triggers (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  date_field_source text not null check (date_field_source in ('built_in', 'custom_field')),
  built_in_field text check (built_in_field in ('date_of_birth', 'wedding_date')),
  -- References member_field_definitions.id (not .key) so relabeling a
  -- custom field never breaks the trigger — resolved id -> key at read
  -- time against the live definition.
  date_field_id uuid references public.member_field_definitions (id) on delete set null,
  occasion_label text not null check (length(trim(occasion_label)) >= 1),
  days_offset integer not null default 0 check (days_offset >= 0 and days_offset <= 30),
  template_id uuid references public.automation_templates (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (date_field_source = 'built_in' and built_in_field is not null and date_field_id is null)
    or
    (date_field_source = 'custom_field' and date_field_id is not null and built_in_field is null)
  )
);

create index if not exists automation_triggers_automation_id_idx on public.automation_triggers (automation_id);
create index if not exists automation_triggers_organization_id_idx on public.automation_triggers (organization_id);

drop trigger if exists set_automation_triggers_updated_at on public.automation_triggers;
create trigger set_automation_triggers_updated_at
  before update on public.automation_triggers
  for each row execute function public.set_updated_at();

alter table public.automation_triggers enable row level security;

drop policy if exists "Org members can view automation triggers" on public.automation_triggers;
create policy "Org members can view automation triggers"
  on public.automation_triggers
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add automation triggers" on public.automation_triggers;
create policy "Admins can add automation triggers"
  on public.automation_triggers
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update automation triggers" on public.automation_triggers;
create policy "Admins can update automation triggers"
  on public.automation_triggers
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete automation triggers" on public.automation_triggers;
create policy "Admins can delete automation triggers"
  on public.automation_triggers
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create table if not exists public.automation_destinations (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('direct_member', 'staff_digest')),
  is_active boolean not null default true,
  -- staff_digest only — E.164 numbers normalized via
  -- normalizePhoneNumber() from whatsapp/validation.ts.
  recipient_phones text[],
  -- staff_digest only — must reference a kind='staff_digest' template
  -- (enforced in TS, same reasoning as automation_templates.kind above).
  digest_template_id uuid references public.automation_templates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, kind),
  check (
    (kind = 'direct_member' and recipient_phones is null and digest_template_id is null)
    or
    (kind = 'staff_digest')
  )
);

create index if not exists automation_destinations_automation_id_idx on public.automation_destinations (automation_id);
create index if not exists automation_destinations_organization_id_idx on public.automation_destinations (organization_id);

drop trigger if exists set_automation_destinations_updated_at on public.automation_destinations;
create trigger set_automation_destinations_updated_at
  before update on public.automation_destinations
  for each row execute function public.set_updated_at();

alter table public.automation_destinations enable row level security;

drop policy if exists "Org members can view automation destinations" on public.automation_destinations;
create policy "Org members can view automation destinations"
  on public.automation_destinations
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add automation destinations" on public.automation_destinations;
create policy "Admins can add automation destinations"
  on public.automation_destinations
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update automation destinations" on public.automation_destinations;
create policy "Admins can update automation destinations"
  on public.automation_destinations
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete automation destinations" on public.automation_destinations;
create policy "Admins can delete automation destinations"
  on public.automation_destinations
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

-- The idempotency + audit table. No generic audit-log system exists in
-- this codebase (checked) — this table, plus created_by/updated_by on
-- automations above, is this feature's own record of what happened.
--
-- Idempotency keys (computed in TS, see src/lib/automations/send.ts):
--   direct:{triggerId}:{memberId}:{occurrenceYear}   -- at most once per
--     member per trigger per occurrence year, regardless of retries
--   digest:{automationId}:{YYYY-MM-DD in Asia/Kolkata}   -- at most once
--     per automation per calendar day
-- The unique index on idempotency_key is what actually prevents double
-- sends; send flow is insert-then-send (reserve the row, only call the
-- WhatsApp API if the insert succeeded), so two overlapping cron runs
-- race safely on the DB rather than both reaching the Graph API.
create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  destination_kind text not null check (destination_kind in ('direct_member', 'staff_digest')),
  trigger_id uuid references public.automation_triggers (id) on delete set null,
  member_id uuid references public.members (id) on delete set null,
  idempotency_key text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  meta_message_id text,
  recipient_count integer not null default 1,
  sent_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists automation_executions_organization_id_idx on public.automation_executions (organization_id);
create index if not exists automation_executions_automation_id_idx on public.automation_executions (automation_id);
create index if not exists automation_executions_member_id_idx on public.automation_executions (member_id);

alter table public.automation_executions enable row level security;

-- Written exclusively by the daily cron job via the admin client (service
-- role bypasses RLS) — no end-user session ever inserts here, so there is
-- deliberately no insert/update/delete policy for `authenticated`, same
-- reasoning already documented on platform_feature_flags.
drop policy if exists "Org members can view automation executions" on public.automation_executions;
create policy "Org members can view automation executions"
  on public.automation_executions
  for select
  to authenticated
  using (public.is_org_member(organization_id));
