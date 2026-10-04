import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { sharedServiceNetAmount } from "@/lib/finance/fees";

export const getEvents = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, members(id, first_name, last_name), branches(id, name)")
    .eq("organization_id", organizationId)
    .order("start_at", { ascending: true });

  return data ?? [];
});

// Per-event payout ledger for platform-gateway paid events — mirrors
// getFundraisers' aggregation in src/lib/finance/dal.ts exactly.
// "Collected" is deliberately read from event_registration_payment_orders
// (status = 'paid'), never from event_registrations.payment_status — the
// latter also flips to 'paid' when staff manually mark a registration
// paid (markRegistrationPaid, for cash/bank-transfer/external-link
// payments that never touched the platform's Razorpay account), and none
// of that money is ever payable out.
export const getEventPayoutLedger = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: orders }, { data: payouts }, { data: payoutRequests }] = await Promise.all([
    supabase
      .from("event_registration_payment_orders")
      .select("event_id, amount")
      .eq("organization_id", organizationId)
      .eq("status", "paid"),
    supabase
      .from("event_payouts")
      .select("event_id, amount, note, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_payout_requests")
      .select("id, event_id, amount")
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
  ]);

  const collectedByEvent = new Map<string, number>();
  for (const order of orders ?? []) {
    collectedByEvent.set(order.event_id, (collectedByEvent.get(order.event_id) ?? 0) + order.amount);
  }

  const paidOutByEvent = new Map<string, number>();
  const payoutHistoryByEvent = new Map<string, { amount: number; note: string | null; createdAt: string }[]>();
  for (const payout of payouts ?? []) {
    paidOutByEvent.set(payout.event_id, (paidOutByEvent.get(payout.event_id) ?? 0) + payout.amount);
    const history = payoutHistoryByEvent.get(payout.event_id) ?? [];
    history.push({ amount: payout.amount, note: payout.note, createdAt: payout.created_at });
    payoutHistoryByEvent.set(payout.event_id, history);
  }

  const pendingRequestByEvent = new Map<string, { id: string; amount: number }>();
  for (const request of payoutRequests ?? []) {
    pendingRequestByEvent.set(request.event_id, { id: request.id, amount: request.amount });
  }

  const ledger = new Map<
    string,
    { collected: number; owed: number; pendingPayoutRequest: { id: string; amount: number } | null; payoutHistory: { amount: number; note: string | null; createdAt: string }[] }
  >();
  for (const eventId of collectedByEvent.keys()) {
    const collected = collectedByEvent.get(eventId) ?? 0;
    const paidOut = paidOutByEvent.get(eventId) ?? 0;
    ledger.set(eventId, {
      collected,
      owed: sharedServiceNetAmount(collected) - paidOut,
      pendingPayoutRequest: pendingRequestByEvent.get(eventId) ?? null,
      payoutHistory: payoutHistoryByEvent.get(eventId) ?? [],
    });
  }

  return ledger;
});
