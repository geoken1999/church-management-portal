"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Lets a church on the shared number keep sending marketing even though its
// recent delivery record would pause it, or puts the pause back.
export async function setMarketingOverrideAction(organizationId: string, allow: boolean): Promise<{ error?: string }> {
  const admin = await requirePlatformAdmin();
  const db = createAdminClient();
  const { error } = await db.from("organizations").update({ whatsapp_marketing_override: allow }).eq("id", organizationId);
  if (error) return { error: "Couldn't save that." };

  await logPlatformEvent({
    level: "warning",
    source: "platform_admin",
    message: `Platform admin (${admin.email ?? "unknown"}) ${allow ? "lifted" : "restored"} the WhatsApp marketing pause for an organization`,
    organizationId,
  });
  revalidatePath("/platform-admin/whatsapp-health");
  return {};
}
