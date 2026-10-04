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

export interface EventPayoutLedgerEntry {
  eventId: string;
  eventTitle: string;
  organizationId: string;
  organizationName: string;
  collected: number;
  paidOut: number;
  owed: number;
  pendingRequest: { id: string; amount: number } | null;
}

// Mirrors getSharedFundraiserLedger exactly, for platform-gateway paid
// events instead of shared-mode fundraisers. "Collected" comes from
// event_registration_payment_orders (status = 'paid') — the only rows
// that represent money Razorpay actually captured into the platform's
// account, never from event_registrations.payment_status (which also
// flips to 'paid' for manually-reconciled cash/bank-transfer/external-link
// payments that never touched this account).
export async function getEventPayoutLedgerAdmin(): Promise<EventPayoutLedgerEntry[]> {
  const admin = createAdminClient();

  const [{ data: events }, { data: orders }, { data: payouts }, { data: pendingRequests }] = await Promise.all([
    admin
      .from("events")
      .select("id, title, organization_id, organizations(name)")
      .eq("payment_gateway", "platform"),
    admin.from("event_registration_payment_orders").select("event_id, amount").eq("status", "paid"),
    admin.from("event_payouts").select("event_id, amount"),
    admin.from("event_payout_requests").select("id, event_id, amount").eq("status", "pending"),
  ]);

  const collectedByEvent = new Map<string, number>();
  for (const order of orders ?? []) {
    collectedByEvent.set(order.event_id, (collectedByEvent.get(order.event_id) ?? 0) + order.amount);
  }

  const paidOutByEvent = new Map<string, number>();
  for (const payout of payouts ?? []) {
    paidOutByEvent.set(payout.event_id, (paidOutByEvent.get(payout.event_id) ?? 0) + payout.amount);
  }

  const pendingByEvent = new Map<string, { id: string; amount: number }>();
  for (const request of pendingRequests ?? []) {
    pendingByEvent.set(request.event_id, { id: request.id, amount: request.amount });
  }

  return (events ?? [])
    .map((event) => {
      const collected = collectedByEvent.get(event.id) ?? 0;
      const paidOut = paidOutByEvent.get(event.id) ?? 0;
      return {
        eventId: event.id,
        eventTitle: event.title,
        organizationId: event.organization_id,
        organizationName: (event.organizations as { name: string } | null)?.name ?? "Unknown church",
        collected,
        paidOut,
        owed: sharedServiceNetAmount(collected) - paidOut,
        pendingRequest: pendingByEvent.get(event.id) ?? null,
      };
    })
    .filter((entry) => entry.collected > 0)
    .sort((a, b) => {
      if (Boolean(a.pendingRequest) !== Boolean(b.pendingRequest)) return a.pendingRequest ? -1 : 1;
      return b.owed - a.owed;
    });
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

export interface TenantUsage {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  country: string | null;
  createdAt: string;
  plan: string;
  planName: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  congregationMembers: number;
  branches: number;
  branchCountClaimed: number | null;
  teamLogins: number;
  leaders: number;
  youth: number;
  families: number;
  eventsCount: number;
  activeFundraisers: number;
  donationsTotalAllTime: number;
  offeringsTotalAllTime: number;
  supportTicketsCount: number;
  emailsSentThisMonth: number;
  emailsSentAllTime: number;
  smsSentThisMonth: number;
  smsSentAllTime: number;
  whatsappSentThisMonth: number;
  whatsappSentAllTime: number;
  deliveryFailuresLast30Days: number;
  storageBytesUsed: number;
  storageBytesLimit: number;
  addonSmsCredits: number;
  addonEmailCredits: number;
  addonWhatsappCredits: number;
  addonStorageBytes: number;
}

// "This month" mirrors the exact quota-metering rules getPlanUsage
// enforces (src/lib/plans/dal.ts) — email only counts the shared-service
// provider (an org's own SMTP is unmetered), WhatsApp only counts shared
// mode (an org's own Twilio number is unmetered), SMS has no
// bring-your-own option so every send counts. "All time" instead sums
// every row regardless of provider/mode, since that's the true send
// volume a Super Admin would actually want to see, separate from what's
// billable.
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// The org-facing getPlanUsage (src/lib/plans/dal.ts) can't be reused here —
// it runs every query through the RLS-scoped, per-user client, and a
// platform admin overseeing a tenant isn't a member of it. Everything
// below re-implements the same aggregations against the service-role
// client instead, one org at a time (not the whole-platform sweep
// getAllTenants does), for the Super Admin tenant detail page.
export async function getTenantUsage(organizationId: string): Promise<TenantUsage | null> {
  const admin = createAdminClient();
  const since = startOfMonthIso();
  const failureSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: organization },
    { data: subscription },
    { count: congregationMembers },
    { count: branches },
    { count: teamMembers },
    { count: leaders },
    { count: youth },
    { count: families },
    { count: events },
    { count: fundraisers },
    { data: donations },
    { data: offerings },
    { count: supportTickets },
    { data: emailCampaigns },
    { data: smsCampaigns },
    { data: whatsappCampaigns },
    { count: deliveryFailures },
    { data: storageBytesUsed },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, logo_url, country, plan, trial_ends_at, branch_count, created_at, addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes")
      .eq("id", organizationId)
      .maybeSingle(),
    admin.from("organization_subscriptions").select("status").eq("organization_id", organizationId).maybeSingle(),
    admin.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("leaders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("youths").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("families").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("fundraisers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    admin.from("donations").select("amount").eq("organization_id", organizationId),
    admin.from("offerings").select("amount").eq("organization_id", organizationId),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("email_campaigns").select("sent_count, provider, created_at").eq("organization_id", organizationId),
    admin.from("sms_campaigns").select("sent_count, created_at").eq("organization_id", organizationId),
    admin.from("whatsapp_campaigns").select("sent_count, mode, created_at").eq("organization_id", organizationId),
    admin
      .from("message_delivery_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", failureSince)
      .or("status.ilike.%fail%,status.ilike.%bounce%,status.ilike.%undeliver%"),
    admin.rpc("get_tenant_storage_bytes", { target_org_id: organizationId }),
  ]);

  if (!organization) return null;

  const planId = organization.plan && isPlanId(organization.plan) ? organization.plan : "basic";
  const plan = PLANS[planId];

  const sumSentCount = (rows: { sent_count: number }[] | null) => (rows ?? []).reduce((sum, r) => sum + r.sent_count, 0);
  const sumAmount = (rows: { amount: number }[] | null) => (rows ?? []).reduce((sum, r) => sum + r.amount, 0);

  const emailRows = emailCampaigns ?? [];
  const smsRows = smsCampaigns ?? [];
  const whatsappRows = whatsappCampaigns ?? [];

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logoUrl: organization.logo_url,
    country: organization.country,
    createdAt: organization.created_at,
    plan: planId,
    planName: plan.name,
    subscriptionStatus: subscription?.status ?? null,
    trialEndsAt: organization.trial_ends_at,
    congregationMembers: congregationMembers ?? 0,
    branches: branches ?? 0,
    branchCountClaimed: organization.branch_count,
    teamLogins: teamMembers ?? 0,
    leaders: leaders ?? 0,
    youth: youth ?? 0,
    families: families ?? 0,
    eventsCount: events ?? 0,
    activeFundraisers: fundraisers ?? 0,
    donationsTotalAllTime: sumAmount(donations),
    offeringsTotalAllTime: sumAmount(offerings),
    supportTicketsCount: supportTickets ?? 0,
    emailsSentThisMonth: sumSentCount(emailRows.filter((r) => r.provider === "shared" && r.created_at >= since)),
    emailsSentAllTime: sumSentCount(emailRows),
    smsSentThisMonth: sumSentCount(smsRows.filter((r) => r.created_at >= since)),
    smsSentAllTime: sumSentCount(smsRows),
    whatsappSentThisMonth: sumSentCount(whatsappRows.filter((r) => r.mode === "shared" && r.created_at >= since)),
    whatsappSentAllTime: sumSentCount(whatsappRows),
    deliveryFailuresLast30Days: deliveryFailures ?? 0,
    storageBytesUsed: typeof storageBytesUsed === "number" ? storageBytesUsed : 0,
    storageBytesLimit: plan.storageBytes + organization.addon_storage_bytes,
    addonSmsCredits: organization.addon_sms_credits,
    addonEmailCredits: organization.addon_email_credits,
    addonWhatsappCredits: organization.addon_whatsapp_credits,
    addonStorageBytes: organization.addon_storage_bytes,
  };
}

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
// Health — database/storage metrics. Per-integration health (Twilio,
// Resend, Razorpay, Instagram, Facebook, YouTube) lives in
// src/lib/platform-admin/integration-health.ts, which actually pings each
// provider rather than just checking env var presence; Vercel and the
// Supabase Management API each have their own dedicated live check
// (src/lib/platform-admin/vercel.ts, supabase-management.ts).
// ---------------------------------------------------------------------------


// This app runs on Vercel (serverless functions, not a fixed always-on
// box) — there's no single "server" to read CPU usage or uptime off from
// inside a request, since each invocation is its own short-lived
// container. Real request/execution/CPU metrics live in Vercel's own
// Observability dashboard, linked from the Health page instead of faked
// here. What IS genuinely observable from in here: whether the database
// actually responds, and how much it and file storage have grown.
export interface DatabaseHealth {
  reachable: boolean;
  latencyMs: number | null;
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const admin = createAdminClient();
  const start = Date.now();
  const { error } = await admin.from("organizations").select("id").limit(1);
  const latencyMs = Date.now() - start;
  return { reachable: !error, latencyMs: error ? null : latencyMs };
}

export interface PlatformStorageStats {
  fileStorageBytes: number;
  databaseBytes: number;
}

export async function getPlatformStorageStats(): Promise<PlatformStorageStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_platform_storage_stats").maybeSingle();
  if (error || !data) return null;
  return { fileStorageBytes: data.file_storage_bytes, databaseBytes: data.database_bytes };
}

// ---------------------------------------------------------------------------
// Logs — platform_events written by logPlatformEvent (see
// src/lib/platform-events/log.ts).
// ---------------------------------------------------------------------------

export async function getPlatformEvents(filter: { level?: PlatformEventLevel; limit?: number; since?: string } = {}): Promise<PlatformEvent[]> {
  const admin = createAdminClient();
  let query = admin.from("platform_events").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.level) {
    query = query.eq("level", filter.level);
  }
  if (filter.since) {
    query = query.gte("created_at", filter.since);
  }
  const { data } = await query;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Active sessions — see migration 0083. auth.sessions/auth.users aren't
// PostgREST-exposed, so this goes through a security definer RPC rather
// than a plain .from() query.
// ---------------------------------------------------------------------------

export interface ActiveSession {
  sessionId: string;
  userId: string;
  userEmail: string;
  organizationNames: string[];
  createdAt: string;
  updatedAt: string;
  notAfter: string | null;
  userAgent: string | null;
  ip: string | null;
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_active_sessions");
  if (error || !data) return [];
  return data.map((row) => ({
    sessionId: row.session_id,
    userId: row.user_id,
    userEmail: row.user_email ?? "(no email)",
    organizationNames: row.organization_names,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notAfter: row.not_after,
    userAgent: row.user_agent,
    ip: row.ip,
  }));
}
