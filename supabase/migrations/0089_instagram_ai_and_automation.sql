-- Supports three Instagram features: AI auto-reply mode per conversation,
-- comment-triggered DM automation rules, and the webhook-to-organization
-- lookup both of them need.

-- Instagram's messaging webhook identifies the business account by a
-- messaging-scoped id (entry[].id) that is NOT the same id
-- instagram_connections.instagram_user_id stores (that one comes from the
-- profile endpoint — same account, two separate id namespaces, confirmed
-- empirically while building the Conversations UI). Without this column
-- there's no way for an inbound webhook event to know which organization
-- it belongs to. Populated lazily: set the first time anyone loads the
-- Instagram dashboard after this migration runs (see attachReadState's
-- sibling in dal.ts), not backfilled here.
alter table public.instagram_connections
  add column if not exists messaging_user_id text;

create unique index if not exists instagram_connections_messaging_user_id_idx
  on public.instagram_connections (messaging_user_id)
  where messaging_user_id is not null;

-- AI mode is a per-conversation toggle (identified by the other person's
-- participant id, not Instagram's opaque conversation id — the webhook
-- payload gives us a sender id, not a conversation id, so keying on
-- participant id avoids an extra API call per inbound message to resolve
-- one from the other).
create table if not exists public.instagram_ai_mode (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  participant_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, participant_id)
);

create index if not exists instagram_ai_mode_org_idx on public.instagram_ai_mode (organization_id);

drop trigger if exists set_instagram_ai_mode_updated_at on public.instagram_ai_mode;
create trigger set_instagram_ai_mode_updated_at
  before update on public.instagram_ai_mode
  for each row execute function public.set_updated_at();

alter table public.instagram_ai_mode enable row level security;

drop policy if exists "Members can view their org's instagram ai mode" on public.instagram_ai_mode;
create policy "Members can view their org's instagram ai mode"
  on public.instagram_ai_mode for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can upsert instagram ai mode" on public.instagram_ai_mode;
create policy "Members can upsert instagram ai mode"
  on public.instagram_ai_mode for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update instagram ai mode" on public.instagram_ai_mode;
create policy "Members can update instagram ai mode"
  on public.instagram_ai_mode for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Comment -> private-reply-DM automation rules. media_id null means "any
-- post"; keyword null means "any comment". A null-media + null-keyword row
-- is a catch-all — matching picks the most specific rule first (see
-- src/lib/instagram/automation.ts), not every matching rule, so one
-- comment never fires two DMs.
create table if not exists public.instagram_comment_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  media_id text,
  keyword text,
  reply_template text not null check (length(trim(reply_template)) >= 1),
  enabled boolean not null default true,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_comment_automations_org_idx on public.instagram_comment_automations (organization_id);

drop trigger if exists set_instagram_comment_automations_updated_at on public.instagram_comment_automations;
create trigger set_instagram_comment_automations_updated_at
  before update on public.instagram_comment_automations
  for each row execute function public.set_updated_at();

alter table public.instagram_comment_automations enable row level security;

-- Viewing is open to any org member (same as the rest of the Instagram
-- tab), but a misconfigured rule auto-DMs real commenters on the church's
-- behalf, so writes are admin-only — same bar as connecting/disconnecting
-- Instagram itself (migration 0019).
drop policy if exists "Members can view their org's comment automations" on public.instagram_comment_automations;
create policy "Members can view their org's comment automations"
  on public.instagram_comment_automations for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create comment automations" on public.instagram_comment_automations;
create policy "Admins can create comment automations"
  on public.instagram_comment_automations for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Members can update comment automations" on public.instagram_comment_automations;
create policy "Admins can update comment automations"
  on public.instagram_comment_automations for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Members can delete comment automations" on public.instagram_comment_automations;
create policy "Admins can delete comment automations"
  on public.instagram_comment_automations for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Idempotency guard: Meta can and does redeliver the same webhook event
-- more than once, and a private reply can only be sent once per comment
-- anyway (Meta-enforced) — this table is service-role-only (the webhook
-- route uses the service client, never a user session) so it has no "org
-- member" policy, just RLS enabled with no policies, matching how other
-- service-role-only tables in this app are locked down.
create table if not exists public.instagram_comment_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  comment_id text not null unique,
  automation_id uuid references public.instagram_comment_automations (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.instagram_comment_replies enable row level security;
