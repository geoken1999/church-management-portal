import "server-only";

import { cashfreeApiBase } from "@/lib/payments/gateways";

export interface CashfreeCredentials {
  appId: string;
  secretKey: string;
  environment: "live" | "test";
}

const API_VERSION = "2023-08-01";

function headers(creds: CashfreeCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-version": API_VERSION,
    "x-client-id": creds.appId,
    "x-client-secret": creds.secretKey,
  };
}

// Creates a Cashfree order; the browser then opens Cashfree's checkout with the
// returned payment_session_id, and Cashfree sends the person to returnUrl
// afterwards (it fills in {order_id}).
export async function createCashfreeOrder(
  creds: CashfreeCredentials,
  input: { orderId: string; amount: number; customerId: string; customerName: string; customerEmail: string; customerPhone: string; returnUrl: string; note: string },
): Promise<{ paymentSessionId: string } | { error: string }> {
  const response = await fetch(`${cashfreeApiBase(creds.environment)}/orders`, {
    method: "POST",
    headers: headers(creds),
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: Number(input.amount.toFixed(2)),
      order_currency: "INR",
      order_note: input.note.slice(0, 200),
      customer_details: {
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: { return_url: input.returnUrl },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { payment_session_id?: string; message?: string };
  if (!response.ok || !body.payment_session_id) return { error: body.message ?? "Cashfree couldn't create the order." };
  return { paymentSessionId: body.payment_session_id };
}

// The order's status straight from Cashfree: never trust the browser's word that
// a payment succeeded.
export async function getCashfreeOrderStatus(creds: CashfreeCredentials, orderId: string): Promise<{ status: string; amount: number } | { error: string }> {
  const response = await fetch(`${cashfreeApiBase(creds.environment)}/orders/${encodeURIComponent(orderId)}`, { headers: headers(creds) });
  const body = (await response.json().catch(() => ({}))) as { order_status?: string; order_amount?: number; message?: string };
  if (!response.ok || !body.order_status) return { error: body.message ?? "Couldn't check the payment with Cashfree." };
  return { status: body.order_status, amount: Number(body.order_amount ?? 0) };
}

// The successful payment on an order, if any: its id is what the receipts and the books refer to.
export async function getCashfreeSuccessfulPaymentId(creds: CashfreeCredentials, orderId: string): Promise<string | null> {
  const response = await fetch(`${cashfreeApiBase(creds.environment)}/orders/${encodeURIComponent(orderId)}/payments`, { headers: headers(creds) });
  const body = (await response.json().catch(() => [])) as { payment_status?: string; cf_payment_id?: string | number }[];
  if (!response.ok || !Array.isArray(body)) return null;
  const paid = body.find((p) => p.payment_status === "SUCCESS");
  return paid?.cf_payment_id != null ? String(paid.cf_payment_id) : null;
}
