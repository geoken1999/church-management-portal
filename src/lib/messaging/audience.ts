import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePhoneCountry } from "@/lib/sms/validation";

export type Channel = "sms" | "whatsapp" | "email";

// Who a message is aimed at, as on the web Email, SMS and WhatsApp pages: a
// branch, a people group (leaders, youth, ...), or specific people.
export interface AudienceFilter {
  branchId?: string;
  groupKey?: string;
  memberIds?: string[];
}

export const GROUPS = [
  { key: "leaders", label: "Leaders", table: "leaders" },
  { key: "youth", label: "Youth", table: "youths" },
  { key: "worship", label: "Worship team", table: "worship_team_members" },
  { key: "media", label: "Media team", table: "media_team_members" },
  { key: "committee", label: "Committee", table: "committee_members" },
] as const;

export interface AudiencePerson {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  countryCode: string | null;
}

// The active members the filter selects who can be reached on [channel] (a phone
// number for SMS and WhatsApp, an email address for email).
export async function resolveAudience(organizationId: string, channel: Channel, filter: AudienceFilter): Promise<AudiencePerson[]> {
  const admin = createAdminClient();

  let groupMemberIds: Set<string> | null = null;
  if (filter.groupKey) {
    const group = GROUPS.find((g) => g.key === filter.groupKey);
    if (!group) return [];
    const { data } = await admin.from(group.table).select("member_id").eq("organization_id", organizationId);
    groupMemberIds = new Set((data ?? []).map((row) => row.member_id as string));
  }

  const [{ data: members }, { data: branches }, { data: org }] = await Promise.all([
    admin.from("members").select("id, first_name, last_name, phone, email, branch_id, status").eq("organization_id", organizationId).eq("status", "active").limit(5000),
    admin.from("branches").select("id, country").eq("organization_id", organizationId),
    admin.from("organizations").select("country").eq("id", organizationId).maybeSingle(),
  ]);
  const branchCountry = new Map((branches ?? []).map((b) => [b.id, b.country]));
  const explicit = filter.memberIds && filter.memberIds.length > 0 ? new Set(filter.memberIds) : null;

  return (members ?? [])
    .filter((m) => (!filter.branchId || m.branch_id === filter.branchId) && (!groupMemberIds || groupMemberIds.has(m.id)) && (!explicit || explicit.has(m.id)))
    .filter((m) => (channel === "email" ? Boolean(m.email) : Boolean(m.phone)))
    .map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      phone: m.phone,
      email: m.email,
      countryCode: resolvePhoneCountry(m.branch_id ? branchCountry.get(m.branch_id) : null, org?.country),
    }));
}

export function parseAudience(raw: unknown): AudienceFilter {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" && value[key] ? (value[key] as string) : undefined);
  return {
    branchId: text("branchId"),
    groupKey: text("groupKey"),
    memberIds: Array.isArray(value.memberIds) ? value.memberIds.filter((id): id is string => typeof id === "string").slice(0, 2000) : undefined,
  };
}
