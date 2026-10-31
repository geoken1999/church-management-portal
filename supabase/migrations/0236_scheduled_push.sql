-- Push notifications can be scheduled like email, SMS and WhatsApp campaigns: the same table and the same
-- five-minute runner. The payload holds who it goes to (audience, group, branch or member), the title, message,
-- link and button. Who receives it is worked out when it is sent, so people who join a group in the meantime get it.
alter table public.scheduled_campaigns drop constraint if exists scheduled_campaigns_channel_check;
alter table public.scheduled_campaigns
  add constraint scheduled_campaigns_channel_check check (channel in ('email', 'sms', 'whatsapp', 'push'));
