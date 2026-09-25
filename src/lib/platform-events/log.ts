import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformEventLevel } from "@/types/database";

// Fixed, known sources rather than free text — keeps the Logs page's
// filter dropdown meaningful instead of one entry per slightly different
// string a call site happened to type.
export type PlatformEventSource =
  | "razorpay_webhook"
  | "whatsapp_webhook"
  | "sms_send"
  | "email_send"
  | "whatsapp_send"
  | "quota"
  | "addon_purchase"
  | "fundraiser_giving"
  | "platform_admin";

// Fire-and-forget: a logging failure must never break the real
// request/action it's describing, so every call site awaits this but
// nothing here ever throws — a failed insert is silently dropped rather
// than surfaced, same tradeoff as best-effort analytics.
export async function logPlatformEvent(entry: {
  level: PlatformEventLevel;
  source: PlatformEventSource;
  message: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("platform_events").insert({
      level: entry.level,
      source: entry.source,
      message: entry.message,
      organization_id: entry.organizationId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.error("logPlatformEvent failed:", err);
  }
}
