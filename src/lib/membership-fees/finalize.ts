import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Shared by the Checkout callback (which verifies the HMAC first) and the
// Razorpay webhook (verified by its own signature). Whichever arrives first
// wins. The status-guarded UPDATE means the second caller changes nothing.
export async function finalizeMembershipPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("membership_fee_invoices")
    .select("id, status")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (!invoice) return { error: "That payment could not be found." };
  if (invoice.status === "paid") return { success: true };

  await admin
    .from("membership_fee_invoices")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("status", "due");

  return { success: true };
}
