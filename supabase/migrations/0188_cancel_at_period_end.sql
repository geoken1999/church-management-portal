-- Cancelling a subscription part-way through a billing period: the church keeps the plan it has
-- paid for until the period ends (next_charge_at), is not charged again, and then drops to the
-- free floor. cancel_at_period_end marks a cancellation that is waiting for that date.
alter table public.organization_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_requested_at timestamptz null;

-- Reversal (run manually if needed):
--   alter table public.organization_subscriptions drop column if exists cancel_at_period_end, drop column if exists cancel_requested_at;
