-- WhatsApp AI auto-reply: mirrors Instagram's instagram_ai_mode (migration
-- 0089) exactly, just keyed by phone_number instead of participant_id —
-- WhatsApp conversations are already keyed by phone_number everywhere else
-- in this schema (whatsapp_conversations.phone_number), so this reuses
-- that identity rather than inventing a new one. 'own' mode only, same
-- restriction the inbound webhook itself already has (see migration 0058)
-- — the shared platform number isn't wired to receive inbound messages at
-- all, so AI auto-reply can only ever apply to an org's own connected
-- number.
create table if not exists public.whatsapp_ai_mode (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone_number text not null,
  enabled boolean not null default true,
  is_typing boolean not null default false,
  typing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_number)
);

create index if not exists whatsapp_ai_mode_org_idx on public.whatsapp_ai_mode (organization_id);

drop trigger if exists set_whatsapp_ai_mode_updated_at on public.whatsapp_ai_mode;
create trigger set_whatsapp_ai_mode_updated_at
  before update on public.whatsapp_ai_mode
  for each row execute function public.set_updated_at();

alter table public.whatsapp_ai_mode enable row level security;

drop policy if exists "Members can view their org's whatsapp ai mode" on public.whatsapp_ai_mode;
create policy "Members can view their org's whatsapp ai mode"
  on public.whatsapp_ai_mode for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can upsert whatsapp ai mode" on public.whatsapp_ai_mode;
create policy "Members can upsert whatsapp ai mode"
  on public.whatsapp_ai_mode for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update whatsapp ai mode" on public.whatsapp_ai_mode;
create policy "Members can update whatsapp ai mode"
  on public.whatsapp_ai_mode for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Widen ai_reply_usage.source (added in migration 0095) to allow WhatsApp
-- auto-replies to tag themselves too — same shared credit pool, still just
-- tagged for observability.
alter table public.ai_reply_usage
  drop constraint if exists ai_reply_usage_source_check;
alter table public.ai_reply_usage
  add constraint ai_reply_usage_source_check check (source in ('instagram', 'ask_aura', 'whatsapp'));
