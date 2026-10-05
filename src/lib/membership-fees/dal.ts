import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { sharedServiceNetAmount } from "@/lib/finance/fees";
import type { MembershipFeeInvoice, MembershipFeeSettings, MembershipPayoutRequest } from "@/types/database";

// Reads for the church's membership fee report. Uses the signed-in user's
// session, so the row security policies on these tables apply.

export const getMembershipFeeSettings = cache(async (organizationId: string): Promise<MembershipFeeSettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("membership_fee_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  return (data as MembershipFeeSettings | null) ?? null;
});

export interface MembershipInvoiceRow extends MembershipFeeInvoice {
  memberName: string;
  memberEmail: string | null;
}

export const getMembershipInvoicesForPeriod = cache(async (organizationId: string, period: string): Promise<MembershipInvoiceRow[]> => {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("membership_fee_invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("period", period)
    .order("created_at", { ascending: true });
  const rows = (invoices ?? []) as MembershipFeeInvoice[];
  if (rows.length === 0) return [];

  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("organization_id", organizationId)
    .in("id", [...new Set(rows.map((r) => r.member_id))]);
  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  return rows
    .map((r) => {
      const m = byId.get(r.member_id);
      return {
        ...r,
        memberName: m ? `${m.first_name} ${m.last_name}`.trim() : "Member",
        memberEmail: m?.email ?? null,
      };
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName));
});

export interface MembershipLedger {
  collected: number;
  paidOut: number;
  owed: number;
  pendingRequest: MembershipPayoutRequest | null;
  payouts: { id: string; amount: number; created_at: string; note: string | null }[];
}

export const getMembershipLedger = cache(async (organizationId: string): Promise<MembershipLedger> => {
  const supabase = await createClient();
  const [{ data: paid }, { data: payouts }, { data: pending }] = await Promise.all([
    supabase.from("membership_fee_invoices").select("amount").eq("organization_id", organizationId).eq("status", "paid"),
    supabase.from("membership_payouts").select("id, amount, created_at, note").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("membership_payout_requests").select("*").eq("organization_id", organizationId).eq("status", "pending").maybeSingle(),
  ]);
  const collected = (paid ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const paidOut = (payouts ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    collected: round2(collected),
    paidOut: round2(paidOut),
    owed: round2(sharedServiceNetAmount(collected) - paidOut),
    pendingRequest: (pending as MembershipPayoutRequest | null) ?? null,
    payouts: (payouts ?? []).map((p) => ({ id: p.id, amount: Number(p.amount), created_at: p.created_at, note: p.note })),
  };
});
