-- AI-designed flyers (Design Studio) draw from the same monthly AI credit pool as Ask Aura and reports.
alter table public.ai_reply_usage drop constraint if exists ai_reply_usage_source_check;
alter table public.ai_reply_usage add constraint ai_reply_usage_source_check check (source in ('instagram', 'ask_aura', 'whatsapp', 'report', 'design'));
