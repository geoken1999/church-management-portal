"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import { PAYOUT_STREAMS } from "@/lib/payouts/ledger";
import { requestAllPayoutsCore } from "@/lib/payouts/request";

const PAYOUTS_PATH = "/dashboard/payouts";

export interface RequestAllPayoutsState {
  error?: string;
  success?: boolean;
  created?: number;
  skipped?: string[];
}

// Requests every balance that is owed, one request per Fund Raiser, event and
// membership stream. Each request records the amount and the payout details at
// the time, so editing the saved details later doesn't change a request that's
// already been made. A stream with a request already pending is skipped, and
// the reason is returned.
export async function requestAllPayouts(): Promise<RequestAllPayoutsState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };

  const writable = PAYOUT_STREAMS.filter((s) => membership.tabAccess[s.tab].write).map((s) => s.key);
  const result = await requestAllPayoutsCore(organizationId, user.id, writable);
  if (result.success) revalidatePath(PAYOUTS_PATH);
  return result;
}
