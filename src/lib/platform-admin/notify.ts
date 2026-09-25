import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Best-effort nudge so the single-operator Super Admin doesn't have to
// keep polling /platform-admin/support for new activity — never allowed
// to break the ticket action it's called from, so failures are logged
// (not thrown) and a missing/unconfigured shared email account just skips
// silently rather than erroring out the ticket create/reply itself.
export async function notifyPlatformAdmins(subject: string, bodyHtml: string): Promise<void> {
  const recipients = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0 || !isEmailConfigured()) return;

  try {
    await sendBulkEmail({ fromName: "KingdomFlow Support", subject, html: bodyHtml, recipients });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Failed to notify platform admins: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}
