import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sharedServiceNetAmount } from "@/lib/finance/fees";

export interface SharedFundraiserLedgerEntry {
  fundraiserId: string;
  fundraiserTitle: string;
  organizationId: string;
  organizationName: string;
  collected: number;
  paidOut: number;
  owed: number;
  pendingRequest: { id: string; amount: number } | null;
}

// Spans every organization on the platform, so this always uses the
// service-role client — there is no RLS policy (nor should there be) that
// would let an authenticated org member see this. Access is gated
// entirely by requirePlatformAdmin() at the page layer.
export async function getSharedFundraiserLedger(): Promise<SharedFundraiserLedgerEntry[]> {
  const admin = createAdminClient();

  const [{ data: fundraisers }, { data: donations }, { data: payouts }, { data: pendingRequests }] = await Promise.all([
    admin
      .from("fundraisers")
      .select("id, title, organization_id, organizations(name)")
      .eq("payment_mode", "shared"),
    admin.from("donations").select("fundraiser_id, amount").eq("payment_mode", "shared").not("fundraiser_id", "is", null),
    admin.from("fundraiser_payouts").select("fundraiser_id, amount"),
    admin.from("fundraiser_payout_requests").select("id, fundraiser_id, amount").eq("status", "pending"),
  ]);

  const collectedByFundraiser = new Map<string, number>();
  for (const donation of donations ?? []) {
    if (!donation.fundraiser_id) continue;
    collectedByFundraiser.set(donation.fundraiser_id, (collectedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
  }

  const paidOutByFundraiser = new Map<string, number>();
  for (const payout of payouts ?? []) {
    paidOutByFundraiser.set(payout.fundraiser_id, (paidOutByFundraiser.get(payout.fundraiser_id) ?? 0) + payout.amount);
  }

  const pendingByFundraiser = new Map<string, { id: string; amount: number }>();
  for (const request of pendingRequests ?? []) {
    pendingByFundraiser.set(request.fundraiser_id, { id: request.id, amount: request.amount });
  }

  return (fundraisers ?? [])
    .map((fundraiser) => {
      const collected = collectedByFundraiser.get(fundraiser.id) ?? 0;
      const paidOut = paidOutByFundraiser.get(fundraiser.id) ?? 0;
      return {
        fundraiserId: fundraiser.id,
        fundraiserTitle: fundraiser.title,
        organizationId: fundraiser.organization_id,
        organizationName: (fundraiser.organizations as { name: string } | null)?.name ?? "Unknown church",
        collected,
        paidOut,
        owed: sharedServiceNetAmount(collected) - paidOut,
        pendingRequest: pendingByFundraiser.get(fundraiser.id) ?? null,
      };
    })
    .filter((entry) => entry.collected > 0)
    .sort((a, b) => {
      // Fundraisers with an open request surface first — that's the
      // actionable queue — then by how much is owed.
      if (Boolean(a.pendingRequest) !== Boolean(b.pendingRequest)) return a.pendingRequest ? -1 : 1;
      return b.owed - a.owed;
    });
}

export async function getFundraiserPayoutHistory(fundraiserId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fundraiser_payouts")
    .select("*")
    .eq("fundraiser_id", fundraiserId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
