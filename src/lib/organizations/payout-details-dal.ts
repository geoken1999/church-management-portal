import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PayoutMethod } from "@/types/database";

export interface OrganizationPayoutDetails {
  payoutMethod: PayoutMethod;
  upiId: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
}

export const getOrganizationPayoutDetails = cache(async (organizationId: string): Promise<OrganizationPayoutDetails | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_payout_details")
    .select("payout_method, upi_id, bank_account_holder, bank_account_number, bank_ifsc, bank_name")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;

  return {
    payoutMethod: data.payout_method,
    upiId: data.upi_id,
    bankAccountHolder: data.bank_account_holder,
    bankAccountNumber: data.bank_account_number,
    bankIfsc: data.bank_ifsc,
    bankName: data.bank_name,
  };
});
