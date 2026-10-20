-- K-Connect minutes. A plan now includes minutes of K-Connect per calendar month (video and audio each have a
-- pool; live classes and live-stream rooms are calls too and use them) instead of a cap on one call. Extra
-- minutes can be bought in packs from the K-Connect page. Bought minutes are valid only for the month they were
-- bought in, so the balance remembers that month (YYYY-MM in the church's time zone) and counts as zero in any
-- other month. Used minutes are worked out from kmeet_meetings (started_at to ended_at), so nothing else is stored.

alter table public.organizations
  add column if not exists addon_kmeet_minutes integer not null default 0,
  add column if not exists addon_kmeet_month text;

alter table public.organization_addon_orders
  drop constraint if exists organization_addon_orders_addon_type_check;
alter table public.organization_addon_orders
  add constraint organization_addon_orders_addon_type_check check (addon_type in ('sms', 'email', 'whatsapp', 'storage', 'ai', 'kconnect'));

-- Reversal (run manually if needed):
--   alter table public.organizations drop column if exists addon_kmeet_minutes, drop column if exists addon_kmeet_month;
--   (and put the old addon_type check back, without 'kconnect', after deleting any kconnect orders)
