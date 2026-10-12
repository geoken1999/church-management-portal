import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGivingReceiptEmail } from "@/lib/finance/giving-receipt";
import { givingTitle, recordGivingPayment } from "@/lib/finance/record-giving";
import { getCashfreeOrderStatus } from "@/lib/cashfree/client";
import { getOwnAccount } from "@/lib/payments/own-accounts";
import { DEFAULT_TIMEZONE, dateKeyInTimezone } from "@/lib/organizations/timezone";

// Called from the Cashfree return route. The browser's say-so isn't trusted:
// the order's status and amount are read from Cashfree itself, with the
// church's own credentials, before anything is recorded. The status-guarded
// claim means a repeated return can't record the same payment twice.
export async function finalizeCashfreeGivingOrderPayment(cashfreeOrderId: string): Promise<{ error?: string; success?: boolean }> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("fundraiser_payment_orders")
    .select(
      "id, organization_id, fundraiser_id, giving_type, amount, payment_mode, donor_name, donor_email, status, donation_id, offering_id, fundraisers(title), organizations(name)",
    )
    .eq("cashfree_order_id", cashfreeOrderId)
    .maybeSingle();

  if (!order) return { error: "That payment could not be found." };
  if (order.status === "paid" && (order.donation_id || order.offering_id)) return { success: true };

  const account = await getOwnAccount(order.organization_id, "cashfree");
  if (!account) return { error: "Couldn't verify this payment. Please contact the church directly." };

  const checked = await getCashfreeOrderStatus({ appId: account.keyId, secretKey: account.keySecret, environment: account.environment }, cashfreeOrderId);
  if ("error" in checked) return { error: checked.error };
  if (checked.status !== "PAID") return { error: "The payment was not completed." };
  if (Math.abs(checked.amount - Number(order.amount)) > 0.01) return { error: "The amount paid doesn't match the order." };

  const { data: claimed } = await admin
    .from("fundraiser_payment_orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  if (!claimed) return { success: true };

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", order.organization_id).maybeSingle();
  const donatedOn = dateKeyInTimezone(new Date(), org?.timezone ?? DEFAULT_TIMEZONE);
  const recorded = await recordGivingPayment(admin, order, "Online gift via the church's own Cashfree account.", donatedOn);
  if (!recorded.ok) return { error: "Payment succeeded but couldn't be recorded. Please contact the church directly." };

  await sendGivingReceiptEmail({
    organizationId: order.organization_id,
    organizationName: (order.organizations as { name: string } | null)?.name ?? "Your church",
    fundraiserTitle: givingTitle(order, (order.fundraisers as { title: string } | null)?.title ?? null),
    donorEmail: order.donor_email,
    donorName: order.donor_name,
    amount: order.amount,
    paymentId: cashfreeOrderId,
    donatedOn,
  });

  return { success: true };
}
