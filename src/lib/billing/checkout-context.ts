import "server-only";

import { getBillingDetails } from "@/lib/billing/billing-details-dal";
import { loadInvoiceTemplate } from "@/lib/invoices/template-store";
import type { BillingDetailsInput } from "@/lib/billing/billing-details";

// What the checkout screens need besides the plan: the church's saved billing details (to fill in
// the form) and the seller's state (to show CGST and SGST, or IGST, before paying).
export async function getCheckoutContext(organizationId: string): Promise<{ billingDetails: BillingDetailsInput; sellerState: string }> {
  const [billingDetails, template] = await Promise.all([getBillingDetails(organizationId), loadInvoiceTemplate()]);
  return { billingDetails, sellerState: template.state };
}
