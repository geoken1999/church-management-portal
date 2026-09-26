-- Fixes the org-facing "shared service balance" wallet never reflecting a
-- payout recorded from the platform-admin side.
--
-- Migration 0054 deliberately gave fundraiser_payouts no RLS policy at all
-- (comment there: "read and written exclusively via the service-role
-- client from the platform-admin surface"). But
-- src/lib/finance/dal.ts's getFundraisers() — which computes each
-- fundraiser's "owed" balance for the org's own dashboard — reads this
-- table with the RLS-enforced, per-user client, not the service role. RLS
-- enabled with zero policies denies every row rather than erroring, so
-- that query has always silently returned an empty array: the balance
-- calculation (collected minus fee minus already-paid-out) treated every
-- payout as if it never happened, and requestFundraiserPayout (which DOES
-- use the admin client) would then reject a new request with "nothing
-- owed" once the true total was actually paid out — the two paths
-- disagreed on the same number.
--
-- Matches the SELECT policy already given to the sibling
-- fundraiser_payment_orders table in this same migration (0054) and to
-- fundraiser_payout_requests (0055) — an org seeing its own payout
-- amounts/dates/notes isn't platform-confidential, it's the church's own
-- money. paid_by (an internal auth.users id, not the point of a
-- transaction history) is simply left out of the org-facing DAL's column
-- list rather than hidden via a second RLS layer.
drop policy if exists "Org members can view fundraiser payouts" on public.fundraiser_payouts;
create policy "Org members can view fundraiser payouts"
  on public.fundraiser_payouts for select to authenticated
  using (public.is_org_member(organization_id));
