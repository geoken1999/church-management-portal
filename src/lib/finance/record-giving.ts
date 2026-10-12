import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordKindFor, GIVING_TYPE_LABELS, isGivingType } from "@/lib/finance/giving-types";

export interface PaidGivingOrder {
  id: string;
  organization_id: string;
  fundraiser_id: string | null;
  giving_type: string;
  amount: number;
  payment_mode: string;
  donor_name: string;
}

// What a paid order is called on a receipt.
export function givingTitle(order: { giving_type: string }, fundraiserTitle: string | null): string {
  if (fundraiserTitle) return fundraiserTitle;
  return isGivingType(order.giving_type) ? GIVING_TYPE_LABELS[order.giving_type] : "General fund";
}

// Records a paid order in the books: a donation (fundraiser gifts and
// donations) or an offering (offerings and tithes), and links it back to the
// order. Shared by every payment path so they all record the same way.
export async function recordGivingPayment(
  admin: SupabaseClient,
  order: PaidGivingOrder,
  note: string,
  dateOn: string,
): Promise<{ ok: true } | { ok: false }> {
  const kind = recordKindFor(order.giving_type as Parameters<typeof recordKindFor>[0]);

  if (kind.table === "offerings") {
    const { data, error } = await admin
      .from("offerings")
      .insert({
        organization_id: order.organization_id,
        category: kind.category,
        amount: order.amount,
        collected_on: dateOn,
        notes: `${note} Given by ${order.donor_name}.`,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("giving offering insert failed:", error?.message);
      return { ok: false };
    }
    await admin.from("fundraiser_payment_orders").update({ offering_id: data.id }).eq("id", order.id);
    return { ok: true };
  }

  const { data, error } = await admin
    .from("donations")
    .insert({
      organization_id: order.organization_id,
      fundraiser_id: order.fundraiser_id,
      amount: order.amount,
      donated_on: dateOn,
      method: "online",
      payment_mode: order.payment_mode,
      donor_name: order.donor_name,
      notes: note,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("giving donation insert failed:", error?.message);
    return { ok: false };
  }
  await admin.from("fundraiser_payment_orders").update({ donation_id: data.id }).eq("id", order.id);
  return { ok: true };
}
