import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordKindFor, GIVING_TYPE_LABELS, isGivingType } from "@/lib/finance/giving-types";
import { pushToTeam } from "@/lib/push/team";

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

// Tells the church's team a gift has just been paid: a row in the web bell, and a push to owners, admins and anyone
// who can open the module the gift lands in. Never allowed to fail the payment it reports.
async function notifyGift(admin: SupabaseClient, order: PaidGivingOrder, kind: "offerings" | "donations"): Promise<void> {
  try {
    let fundraiserTitle: string | null = null;
    if (order.fundraiser_id) {
      const { data } = await admin.from("fundraisers").select("title").eq("id", order.fundraiser_id).maybeSingle();
      fundraiserTitle = (data as { title: string } | null)?.title ?? null;
    }
    const what = givingTitle(order, fundraiserTitle);
    const amount = `₹${Number(order.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const title = `Online gift received: ${amount}`;
    const body = `${order.donor_name || "Someone"} gave ${amount}${order.fundraiser_id ? ` to ${what}` : ` as ${what.toLowerCase()}`}.`;
    const link = order.fundraiser_id ? "/dashboard/fundraisers" : `/dashboard/${kind}`;
    await admin.from("notifications").insert({ organization_id: order.organization_id, type: "online_gift", title, body, link });
    await pushToTeam({ organizationId: order.organization_id, tab: order.fundraiser_id ? "fundraisers" : kind, title, body, link });
  } catch (err) {
    console.error("online gift notification failed:", err);
  }
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
    await notifyGift(admin, order, "offerings");
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
  await notifyGift(admin, order, "donations");
  return { ok: true };
}
