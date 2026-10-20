import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformEarningsReport } from "@/lib/platform-admin/finance";
import {
  getCourseLedgerAdmin,
  getEventPayoutLedgerAdmin,
  getMembershipLedgerAdmin,
  getSharedFundraiserLedger,
} from "@/lib/platform-admin/dal";

export const dynamic = "force-dynamic";

// Money at a glance: what KingdomFlow earned, subscriptions by status, the latest subscription payments, and
// what is owed to churches (with any payout they have asked for).
export const GET = (request: Request) =>
  withAdminScope(request, "billing", async () => {
    const admin = createAdminClient();
    const [earnings, subs, payments, fundraisers, events, membership, courses] =
      await Promise.all([
        getPlatformEarningsReport(),
        admin.from("organization_subscriptions").select("status"),
        admin
          .from("platform_subscription_payments")
          .select("organization_id, plan_id, amount, paid_at")
          .order("paid_at", { ascending: false })
          .limit(25),
        getSharedFundraiserLedger(),
        getEventPayoutLedgerAdmin(),
        getMembershipLedgerAdmin(),
        getCourseLedgerAdmin(),
      ]);

    const orgIds = [
      ...new Set(
        (payments.data ?? [])
          .map((p) => p.organization_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: orgs } = orgIds.length
      ? await admin.from("organizations").select("id, name").in("id", orgIds)
      : { data: [] };
    const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

    const subscriptionsByStatus: Record<string, number> = {};
    for (const s of subs.data ?? [])
      subscriptionsByStatus[s.status] =
        (subscriptionsByStatus[s.status] ?? 0) + 1;

    const owed = [
      ...fundraisers.map((e) => ({
        stream: "Fund raisers",
        church: e.organizationName,
        what: e.fundraiserTitle,
        owed: e.owed,
        requested: e.pendingRequest?.amount ?? null,
      })),
      ...events.map((e) => ({
        stream: "Paid events",
        church: e.organizationName,
        what: e.eventTitle,
        owed: e.owed,
        requested: e.pendingRequest?.amount ?? null,
      })),
      ...membership.map((e) => ({
        stream: "Membership fees",
        church: e.organizationName,
        what: "Membership fees",
        owed: e.owed,
        requested: e.pendingRequest?.amount ?? null,
      })),
      ...courses.map((e) => ({
        stream: "Course fees",
        church: e.organizationName,
        what: "Course fees",
        owed: e.owed,
        requested: e.pendingRequest?.amount ?? null,
      })),
    ]
      .filter((row) => row.owed > 0.005 || row.requested !== null)
      .sort(
        (a, b) => (b.requested ?? 0) - (a.requested ?? 0) || b.owed - a.owed,
      );

    return NextResponse.json({
      ok: true,
      earnings,
      subscriptionsByStatus,
      recentPayments: (payments.data ?? []).map((p) => ({
        church:
          (p.organization_id ? orgName.get(p.organization_id) : null) ?? "—",
        plan: p.plan_id,
        amount: Number(p.amount),
        paidAt: p.paid_at,
      })),
      owedToChurches: owed,
    });
  });
