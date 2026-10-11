import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { REPUTATION_WINDOW_DAYS, limitRate, statsFromLog, type SenderStats } from "@/lib/whatsapp/reputation-rules";

export interface OrgWhatsAppHealth {
  id: string;
  name: string;
  override: boolean;
  onShared: boolean;
  week: SenderStats;
  month: SenderStats;
}

// Per church: how WhatsApp has treated its marketing messages over the last
// week and month, worst first. For the Super Admin "WhatsApp health" page.
export async function getWhatsAppHealth(): Promise<OrgWhatsAppHealth[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let sharedKey: string | null = null;
  try {
    sharedKey = getPlatformWhatsAppCredentials().phoneNumberId;
  } catch {
    sharedKey = null;
  }

  const [{ data: rows }, { data: orgs }] = await Promise.all([
    admin.from("whatsapp_message_log").select("organization_id, status, error_code, category, sender_key, created_at").gte("created_at", since).limit(20000),
    admin.from("organizations").select("id, name, whatsapp_marketing_override"),
  ]);

  const windowStart = Date.now() - REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const byOrg = new Map<string, NonNullable<typeof rows>>();
  for (const row of rows ?? []) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  return (orgs ?? [])
    .map((org) => {
      const list = byOrg.get(org.id) ?? [];
      return {
        id: org.id,
        name: org.name,
        override: org.whatsapp_marketing_override,
        onShared: list.some((r) => r.sender_key === sharedKey),
        week: statsFromLog(list.filter((r) => new Date(r.created_at).getTime() >= windowStart)),
        month: statsFromLog(list),
        total: list.length,
      };
    })
    .filter((org) => org.total > 0)
    .sort((a, b) => limitRate(b.week) - limitRate(a.week) || b.total - a.total)
    .map(({ total, ...org }) => {
      void total;
      return org;
    });
}
