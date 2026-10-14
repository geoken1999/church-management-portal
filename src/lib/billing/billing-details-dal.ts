import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_BILLING_DETAILS, cleanBillingDetails, validateBillingDetails, type BillingDetailsErrors, type BillingDetailsInput } from "@/lib/billing/billing-details";

// The church's saved billing details, as the form uses them (empty strings when not saved yet).
export async function getBillingDetails(organizationId: string): Promise<BillingDetailsInput> {
  const { data } = await createAdminClient().from("organization_billing_details").select("*").eq("organization_id", organizationId).maybeSingle();
  if (!data) return EMPTY_BILLING_DETAILS;
  return { legalName: data.legal_name, gstin: data.gstin ?? "", addressLine1: data.address_line1, addressLine2: data.address_line2 ?? "", city: data.city, state: data.state, pincode: data.pincode, email: data.email, phone: data.phone ?? "" };
}

// Checks and saves the billing details given at checkout. Returns the cleaned details, or what to fix.
export async function saveBillingDetails(organizationId: string, input: BillingDetailsInput): Promise<{ details: BillingDetailsInput } | { errors: BillingDetailsErrors }> {
  const errors = validateBillingDetails(input);
  if (Object.keys(errors).length > 0) return { errors };
  const details = cleanBillingDetails(input);
  const { error } = await createAdminClient()
    .from("organization_billing_details")
    .upsert(
      {
        organization_id: organizationId,
        legal_name: details.legalName,
        gstin: details.gstin || null,
        address_line1: details.addressLine1,
        address_line2: details.addressLine2 || null,
        city: details.city,
        state: details.state,
        pincode: details.pincode,
        email: details.email,
        phone: details.phone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (error) return { errors: { legalName: "Couldn't save your billing details. Please try again." } };
  return { details };
}
