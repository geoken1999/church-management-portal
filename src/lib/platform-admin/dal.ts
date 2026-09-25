import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sharedServiceNetAmount } from "@/lib/finance/fees";
import { PLANS, isPlanId } from "@/lib/plans/config";
import type { PlatformEvent, PlatformEventLevel, SupportTicketStatus } from "@/types/database";

export interface SharedFundraiserLedgerEntry {
  fundraiserId: string;
  fundraiserTitle: string;
  organizationId: string;
  organizationName: string;
  collected: number;
  paidOut: number;
  owed: number;
  pendingRequest: { id: string; amount: number } | null;
}

// Spans every organization on the platform, so this always uses the
// service-role client — there is no RLS policy (nor should there be) that
// would let an authenticated org member see this. Access is gated
// entirely by requirePlatformAdmin() at the page layer.
export async function getSharedFundraiserLedger(): Promise<SharedFundraiserLedgerEntry[]> {
  const admin = createAdminClient();

  const [{ data: fundraisers }, { data: donations }, { data: payouts }, { data: pendingRequests }] = await Promise.all([
    admin
      .from("fundraisers")
      .select("id, title, organization_id, organizations(name)")
      .eq("payment_mode", "shared"),
    admin.from("donations").select("fundraiser_id, amount").eq("payment_mode", "shared").not("fundraiser_id", "is", null),
    admin.from("fundraiser_payouts").select("fundraiser_id, amount"),
    admin.from("fundraiser_payout_requests").select("id, fundraiser_id, amount").eq("status", "pending"),
  ]);

  const collectedByFundraiser = new Map<string, number>();
  for (const donation of donations ?? []) {
    if (!donation.fundraiser_id) continue;
    collectedByFundraiser.set(donation.fundraiser_id, (collectedByFundraiser.get(donation.fundraiser_id) ?? 0) + donation.amount);
  }

  const paidOutByFundraiser = new Map<string, number>();
  for (const payout of payouts ?? []) {
    paidOutByFundraiser.set(payout.fundraiser_id, (paidOutByFundraiser.get(payout.fundraiser_id) ?? 0) + payout.amount);
  }

  const pendingByFundraiser = new Map<string, { id: string; amount: number }>();
  for (const request of pendingRequests ?? []) {
    pendingByFundraiser.set(request.fundraiser_id, { id: request.id, amount: request.amount });
  }

  return (fundraisers ?? [])
    .map((fundraiser) => {
      const collected = collectedByFundraiser.get(fundraiser.id) ?? 0;
      const paidOut = paidOutByFundraiser.get(fundraiser.id) ?? 0;
      return {
        fundraiserId: fundraiser.id,
        fundraiserTitle: fundraiser.title,
        organizationId: fundraiser.organization_id,
        organizationName: (fundraiser.organizations as { name: string } | null)?.name ?? "Unknown church",
        collected,
        paidOut,
        owed: sharedServiceNetAmount(collected) - paidOut,
        pendingRequest: pendingByFundraiser.get(fundraiser.id) ?? null,
      };
    })
    .filter((entry) => entry.collected > 0)
    .sort((a, b) => {
      // Fundraisers with an open request surface first — that's the
      // actionable queue — then by how much is owed.
      if (Boolean(a.pendingRequest) !== Boolean(b.pendingRequest)) return a.pendingRequest ? -1 : 1;
      return b.owed - a.owed;
    });
}

export async function getFundraiserPayoutHistory(fundraiserId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fundraiser_payouts")
    .select("*")
    .eq("fundraiser_id", fundraiserId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Tenants — every organization on the platform, with its effective plan,
// subscription status, and owner contact — the Super Admin's "who's on the
// platform and what are they on" view.
// ---------------------------------------------------------------------------

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planName: string;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  memberCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
}

export const getAllTenants = async (): Promise<TenantRow[]> => {
  const admin = createAdminClient();

  const [{ data: organizations }, { data: subscriptions }, { data: owners }, { data: members }] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, plan, trial_ends_at, created_at")
      .order("created_at", { ascending: false }),
    admin.from("organization_subscriptions").select("organization_id, status"),
    admin
      .from("organization_members")
      .select("organization_id, auth_user_id, profiles!inner(first_name, last_name, email)")
      .eq("role", "owner"),
    admin.from("organization_members").select("organization_id"),
  ]);

  const subscriptionByOrg = new Map((subscriptions ?? []).map((s) => [s.organization_id, s.status]));
  const ownerByOrg = new Map(
    (owners ?? []).map((row) => {
      const profile = row.profiles as { first_name: string; last_name: string; email: string } | null;
      return [row.organization_id, profile ? { name: `${profile.first_name} ${profile.last_name}`.trim(), email: profile.email } : null];
    }),
  );
  const memberCountByOrg = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByOrg.set(row.organization_id, (memberCountByOrg.get(row.organization_id) ?? 0) + 1);
  }

  return (organizations ?? []).map((org) => {
    const owner = ownerByOrg.get(org.id) ?? null;
    const planId = org.plan && isPlanId(org.plan) ? org.plan : "basic";
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: planId,
      planName: PLANS[planId].name,
      trialEndsAt: org.trial_ends_at,
      subscriptionStatus: subscriptionByOrg.get(org.id) ?? null,
      memberCount: memberCountByOrg.get(org.id) ?? 0,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      createdAt: org.created_at,
    };
  });
};

export interface PlatformOverview {
  totalTenants: number;
  activeSubscriptions: number;
  trialingCount: number;
  expiredCount: number;
  planCounts: Record<string, number>;
  newTenantsLast7Days: number;
  totalMembers: number;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const tenants = await getAllTenants();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const planCounts: Record<string, number> = { basic: 0, premium: 0, pro: 0 };
  let activeSubscriptions = 0;
  let trialingCount = 0;
  let expiredCount = 0;
  let newTenantsLast7Days = 0;
  let totalMembers = 0;

  for (const tenant of tenants) {
    planCounts[tenant.plan] = (planCounts[tenant.plan] ?? 0) + 1;
    totalMembers += tenant.memberCount;
    if (new Date(tenant.createdAt).getTime() >= sevenDaysAgo) newTenantsLast7Days += 1;

    if (tenant.subscriptionStatus === "active") {
      activeSubscriptions += 1;
    } else {
      const stillTrialing = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > new Date() : false;
      if (stillTrialing) trialingCount += 1;
      else expiredCount += 1;
    }
  }

  return {
    totalTenants: tenants.length,
    activeSubscriptions,
    trialingCount,
    expiredCount,
    planCounts,
    newTenantsLast7Days,
    totalMembers,
  };
}

// ---------------------------------------------------------------------------
// Support — every ticket across every organization, for triage. The org's
// own Support page (src/app/dashboard/support/page.tsx) only shows that
// org's own tickets and has no status-changing UI at all yet — this is
// where that's added, platform-side.
// ---------------------------------------------------------------------------

export interface SupportTicketMessageRow {
  id: string;
  authorType: "org" | "admin";
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface SupportTicketRow {
  id: string;
  organizationId: string;
  organizationName: string;
  subject: string;
  description: string;
  category: string;
  urgency: string;
  status: SupportTicketStatus;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string;
  messages: SupportTicketMessageRow[];
}

export async function getAllSupportTickets(): Promise<SupportTicketRow[]> {
  const admin = createAdminClient();
  const [{ data: tickets }, { data: messages }] = await Promise.all([
    admin
      .from("support_tickets")
      .select("*, organizations(name), profiles(first_name, last_name, email)")
      .order("created_at", { ascending: false }),
    admin
      .from("support_ticket_messages")
      .select("*, profiles(first_name, last_name)")
      .order("created_at", { ascending: true }),
  ]);

  const messagesByTicket = new Map<string, SupportTicketMessageRow[]>();
  for (const message of messages ?? []) {
    const profile = message.profiles as { first_name: string; last_name: string } | null;
    const list = messagesByTicket.get(message.ticket_id) ?? [];
    list.push({
      id: message.id,
      authorType: message.author_type,
      authorName: message.author_type === "admin" ? "KingdomFlow Support" : profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
      body: message.body,
      createdAt: message.created_at,
    });
    messagesByTicket.set(message.ticket_id, list);
  }

  return (tickets ?? []).map((ticket) => {
    const org = ticket.organizations as { name: string } | null;
    const profile = ticket.profiles as { first_name: string; last_name: string; email: string } | null;
    return {
      id: ticket.id,
      organizationId: ticket.organization_id,
      organizationName: org?.name ?? "Unknown church",
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      urgency: ticket.urgency,
      status: ticket.status,
      createdByName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
      createdByEmail: profile?.email ?? null,
      createdAt: ticket.created_at,
      messages: messagesByTicket.get(ticket.id) ?? [],
    };
  });
}


// ---------------------------------------------------------------------------
// Health — which app-wide integrations are configured, purely by env var
// presence (this doesn't verify the credentials actually work, just that
// they're set).
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  name: string;
  configured: boolean;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    { name: "Razorpay (billing & giving)", configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) },
    { name: "Twilio SMS", configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    { name: "Twilio WhatsApp (shared)", configured: Boolean(process.env.TWILIO_WHATSAPP_FROM_NUMBER) },
    { name: "Resend (email)", configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS) },
    { name: "Instagram", configured: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) },
    { name: "YouTube", configured: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) },
    { name: "Facebook", configured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) },
  ];
}

// ---------------------------------------------------------------------------
// Logs — platform_events written by logPlatformEvent (see
// src/lib/platform-events/log.ts).
// ---------------------------------------------------------------------------

export async function getPlatformEvents(filter: { level?: PlatformEventLevel; limit?: number } = {}): Promise<PlatformEvent[]> {
  const admin = createAdminClient();
  let query = admin.from("platform_events").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.level) {
    query = query.eq("level", filter.level);
  }
  const { data } = await query;
  return data ?? [];
}
