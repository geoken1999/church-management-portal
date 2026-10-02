-- Ask Aura: an internal AI chat tool (dashboard > AI Tools > Ask Aura) that
-- answers questions about the organization's own data (attendance, members,
-- events, donations) using tool-calling, distinct from the Instagram DM
-- auto-reply AI. Both draw from the same shared ai_reply_usage/
-- addon_ai_credits pool (per explicit product decision — one AI credit
-- balance, not two) — this migration tags each usage row with its source so
-- the two can still be told apart for observability.
alter table public.ai_reply_usage
  add column if not exists source text not null default 'instagram';

alter table public.ai_reply_usage
  drop constraint if exists ai_reply_usage_source_check;
alter table public.ai_reply_usage
  add constraint ai_reply_usage_source_check check (source in ('instagram', 'ask_aura'));

-- New purchasable add-on pack (see src/lib/plans/config.ts ADDON_PACKS) —
-- tops up the same addon_ai_credits balance the Instagram AI replies and
-- Ask Aura both already draw from.
alter table public.organization_addon_orders
  drop constraint if exists organization_addon_orders_addon_type_check;
alter table public.organization_addon_orders
  add constraint organization_addon_orders_addon_type_check check (addon_type in ('sms', 'email', 'whatsapp', 'storage', 'ai'));

-- Ask Aura's chat history — unlike every other org-data table, this is
-- scoped to the individual user (not visible to the rest of the org), the
-- same "chatting with your own assistant" model as the Instagram AI mode
-- toggle is not: each team member gets their own conversation. Follows
-- device_push_tokens' (migration 0085) self-scoping RLS convention —
-- auth_user_id = auth.uid() directly, no is_org_member() needed on top
-- since a row's organization_id is only ever set to an org the inserting
-- user already belongs to (enforced by the with check clause below).
create table if not exists public.aura_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  auth_user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists aura_messages_org_user_created_idx
  on public.aura_messages (organization_id, auth_user_id, created_at);

alter table public.aura_messages enable row level security;

drop policy if exists "Users manage their own Aura messages" on public.aura_messages;
create policy "Users manage their own Aura messages"
  on public.aura_messages for all to authenticated
  using (auth_user_id = auth.uid() and public.is_org_member(organization_id))
  with check (auth_user_id = auth.uid() and public.is_org_member(organization_id));
