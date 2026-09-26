import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { sharedServiceNetAmount } from "@/lib/finance/fees";

export const getFundraisers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: fundraisers }, { data: donations }, { data: payouts }, { data: payoutRequests }] = await Promise.all([
    supabase
      .from("fundraisers")
      .select("*, branches(id, name), members(id, first_name, last_name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    // Aggregated in JS rather than a SQL view/RPC — the roster of
    // fundraisers per org is small enough that this is negligible, and it
    // avoids adding a database function for one derived number.
    supabase
      .from("donations")
      .select("fundraiser_id, amount, payment_mode")
      .eq("organization_id", organizationId)
      .not("fundraiser_id", "is", null),
    supabase
      .from("fundraiser_payouts")
      .select("fundraiser_id, amount, note, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("fundraiser_payout_requests")
      .select("id, fundraiser_id, amount, status")
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
  ]);

  const raisedByFundraiser = new Map<string, number>();
  const sharedCollectedByFundraiser = new Map<string, number>();
  for (const donation of donations ?? []) {
    if (!donation.fundraiser_id) continue;
    raisedByFundraiser.set(donation.fundraiser_id, (raisedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
    if (donation.payment_mode === "shared") {
      sharedCollectedByFundraiser.set(donation.fundraiser_id, (sharedCollectedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
    }
  }

  const paidOutByFundraiser = new Map<string, number>();
  const payoutHistoryByFundraiser = new Map<string, { amount: number; note: string | null; createdAt: string }[]>();
  for (const payout of payouts ?? []) {
    paidOutByFundraiser.set(payout.fundraiser_id, (paidOutByFundraiser.get(payout.fundraiser_id) ?? 0) + payout.amount);
    const history = payoutHistoryByFundraiser.get(payout.fundraiser_id) ?? [];
    history.push({ amount: payout.amount, note: payout.note, createdAt: payout.created_at });
    payoutHistoryByFundraiser.set(payout.fundraiser_id, history);
  }

  const pendingRequestByFundraiser = new Map<string, { id: string; amount: number }>();
  for (const request of payoutRequests ?? []) {
    pendingRequestByFundraiser.set(request.fundraiser_id, { id: request.id, amount: request.amount });
  }

  return (fundraisers ?? []).map((fundraiser) => {
    const sharedCollected = sharedCollectedByFundraiser.get(fundraiser.id) ?? 0;
    const sharedPaidOut = paidOutByFundraiser.get(fundraiser.id) ?? 0;
    return {
      ...fundraiser,
      raisedAmount: raisedByFundraiser.get(fundraiser.id) ?? 0,
      sharedCollected,
      sharedOwed: sharedServiceNetAmount(sharedCollected) - sharedPaidOut,
      pendingPayoutRequest: pendingRequestByFundraiser.get(fundraiser.id) ?? null,
      payoutHistory: payoutHistoryByFundraiser.get(fundraiser.id) ?? [],
    };
  });
});

// Slim shape for the Donation form's "link to a fundraiser" picker.
export const getFundraiserOptions = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fundraisers")
    .select("id, title")
    .eq("organization_id", organizationId)
    .order("title", { ascending: true });

  return data ?? [];
});

export const getOfferings = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offerings")
    .select("*, branches(id, name)")
    .eq("organization_id", organizationId)
    .order("collected_on", { ascending: false });

  return data ?? [];
});

export const getDonations = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("donations")
    .select("*, members(id, first_name, last_name), fundraisers(id, title)")
    .eq("organization_id", organizationId)
    .order("donated_on", { ascending: false });

  return data ?? [];
});

// Only the key_id (safe to show — it's not secret) plus whether a
// key_secret is on file. The secret itself never leaves this query.
export const getOrganizationRazorpayAccount = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_razorpay_accounts")
    .select("key_id, created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export interface FinanceOverviewStats {
  offeringsThisMonth: number;
  donationsThisMonth: number;
  activeFundraiserCount: number;
  activeFundraiserRaised: number;
  activeFundraiserGoal: number;
}

// Powers the Dashboard's Finance summary — each number is independently
// cheap (small per-org tables, single-column sums), so one query per
// figure rather than a combined view.
export const getFinanceOverviewStats = cache(async (organizationId: string): Promise<FinanceOverviewStats> => {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);

  const [{ data: offerings }, { data: donations }, { data: activeFundraisers }, { data: fundraiserDonations }] =
    await Promise.all([
      supabase
        .from("offerings")
        .select("amount")
        .eq("organization_id", organizationId)
        .gte("collected_on", startOfMonthIso),
      supabase
        .from("donations")
        .select("amount")
        .eq("organization_id", organizationId)
        .gte("donated_on", startOfMonthIso),
      supabase
        .from("fundraisers")
        .select("id, goal_amount")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase.from("donations").select("fundraiser_id, amount").eq("organization_id", organizationId).not("fundraiser_id", "is", null),
    ]);

  const activeFundraiserIds = new Set((activeFundraisers ?? []).map((f) => f.id));
  const raisedByFundraiser = new Map<string, number>();
  for (const donation of fundraiserDonations ?? []) {
    if (!donation.fundraiser_id) continue;
    raisedByFundraiser.set(donation.fundraiser_id, (raisedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
  }

  let activeFundraiserRaised = 0;
  for (const id of activeFundraiserIds) {
    activeFundraiserRaised += raisedByFundraiser.get(id) ?? 0;
  }

  return {
    offeringsThisMonth: (offerings ?? []).reduce((sum, row) => sum + row.amount, 0),
    donationsThisMonth: (donations ?? []).reduce((sum, row) => sum + row.amount, 0),
    activeFundraiserCount: activeFundraiserIds.size,
    activeFundraiserRaised,
    activeFundraiserGoal: (activeFundraisers ?? []).reduce((sum, row) => sum + row.goal_amount, 0),
  };
});
