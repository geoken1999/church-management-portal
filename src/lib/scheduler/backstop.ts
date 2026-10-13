import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueCampaigns } from "@/lib/scheduler/run";

// Anything overdue by this long means the every-5-minutes sender didn't get to it.
const OVERDUE_GRACE_MS = 2 * 60_000;

// A safety net for the scheduler: when someone opens the Email, SMS or WhatsApp page and a
// campaign of theirs is overdue, it is sent right then (after the page has been sent, so the
// page isn't slowed). The regular job does the same work and wins whenever it is running; a
// campaign is claimed before it goes out, so it can never be sent twice.
export async function sendOverdueCampaignsInBackground(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - OVERDUE_GRACE_MS).toISOString();
  const { count } = await admin.from("scheduled_campaigns").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "scheduled").lte("scheduled_at", cutoff);
  if (!count) return;
  after(async () => {
    await runDueCampaigns(createAdminClient(), new Date(), organizationId).catch(() => {});
  });
}
