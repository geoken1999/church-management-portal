import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMembershipReceipt } from "@/lib/membership-fees/receipt";

// Called only from the PayU return route (/api/payu/membership/return),
// after that route has verified PayU's hash — this function itself does no
// verification. Same atomic paid-once claim as before (previously keyed on
// razorpay_order_id/razorpay_payment_id, now payu_txnid/payu_mihpayid): the
// status-guarded UPDATE means a redelivered callback changes nothing.
export async function finalizeMembershipPayment(
  txnid: string,
  mihpayid: string,
): Promise<{ error?: string; success?: boolean }> {
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("membership_fee_invoices")
    .select("id, status")
    .eq("payu_txnid", txnid)
    .maybeSingle();

  if (!invoice) return { error: "That payment could not be found." };
  if (invoice.status === "paid") return { success: true };

  const { data: claimed } = await admin
    .from("membership_fee_invoices")
    .update({ status: "paid", payu_mihpayid: mihpayid, paid_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("status", "due")
    .select("id")
    .maybeSingle();

  // Only the caller that won the claim sends the receipt, so the webhook and
  // the Checkout callback can't both send one.
  if (claimed) {
    await sendMembershipReceipt(admin, invoice.id);
  }

  return { success: true };
}
