import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getFundraisers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: fundraisers }, { data: donations }] = await Promise.all([
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
      .select("fundraiser_id, amount")
      .eq("organization_id", organizationId)
      .not("fundraiser_id", "is", null),
  ]);

  const raisedByFundraiser = new Map<string, number>();
  for (const donation of donations ?? []) {
    if (!donation.fundraiser_id) continue;
    raisedByFundraiser.set(donation.fundraiser_id, (raisedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
  }

  return (fundraisers ?? []).map((fundraiser) => ({
    ...fundraiser,
    raisedAmount: raisedByFundraiser.get(fundraiser.id) ?? 0,
  }));
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
