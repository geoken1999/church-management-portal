-- 1. Fallback: what to do when WhatsApp can't (or won't) deliver a message.
--    'none' keeps today's behavior; 'sms' / 'email' send the same text by
--    that channel instead (automations automatically, campaigns on a click).
alter table public.organizations
  add column if not exists whatsapp_fallback text not null default 'none' check (whatsapp_fallback in ('none', 'sms', 'email')),
  -- Platform admin override: lets a church on the shared number keep sending
  -- marketing even though its recent delivery record would pause it.
  add column if not exists whatsapp_marketing_override boolean not null default false;

-- The text each logged message carried (placeholders filled in), so a
-- failed one can be resent by SMS/email; and when that was done.
alter table public.whatsapp_message_log
  add column if not exists body_text text,
  add column if not exists fallback_sent_at timestamptz;

-- Phones of campaign recipients already resent by SMS/email, so a second
-- click doesn't send them twice.
alter table public.whatsapp_campaigns
  add column if not exists fallback_sent_phones text[] not null default '{}';

-- 2. Opt-in: whether a member agreed to WhatsApp updates. null = never
--    asked (treated as allowed, as before); false = opted out (they replied
--    STOP, or declined on the join form); true = agreed.
alter table public.members
  add column if not exists whatsapp_opt_in boolean;

-- Reversal (run manually if needed):
--   alter table public.members drop column if exists whatsapp_opt_in;
--   alter table public.whatsapp_campaigns drop column if exists fallback_sent_phones;
--   alter table public.whatsapp_message_log drop column if exists body_text, drop column if exists fallback_sent_at;
--   alter table public.organizations drop column if exists whatsapp_fallback, drop column if exists whatsapp_marketing_override;
