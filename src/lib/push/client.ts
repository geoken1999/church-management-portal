import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPushEnv, isPushConfigured } from "@/lib/push/env";
import { buildPushBatches } from "@/lib/push/messages";

export type PushCategory = "event_new" | "todo_assigned" | "todo_due_soon" | "prayer_request" | "account_deletion" | "church_announcement" | "group_post" | "special_day" | "team_alert" | "event_update";

let app: App | null = null;

function getFirebaseApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return existing;
  }
  const { projectId, clientEmail, privateKey } = getPushEnv();
  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return app;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Sends [payload] to every device belonging to [authUserIds], skipping
// anyone who has turned [category] off in notification_preferences — a
// missing preferences row means every category defaults to on (same
// "missing key = default" convention as tab_permissions, migration 0040).
//
// Best-effort by design: called directly from server actions (createEvent,
// createTodo/updateTodo) and the daily reminder cron, the same way
// src/lib/email/client.ts and src/lib/sms/client.ts are called — never
// awaited in a way that would fail the calling action if sending fails, and
// silently a no-op if Firebase isn't configured yet (isPushConfigured()),
// so this is safe to leave wired in before FIREBASE_SERVICE_ACCOUNT_JSON
// exists in every environment.
export interface PushResult {
  // Why nothing was sent, when that is the case.
  skipped?: "no_recipients" | "not_configured" | "opted_out" | "no_devices" | "send_failed";
  devices: number;
  delivered: number;
  failed: number;
  // First FCM error code/message, to make a failure diagnosable.
  error?: string;
}

export async function sendPushToUsers(authUserIds: string[], category: PushCategory, payload: PushPayload): Promise<PushResult> {
  if (authUserIds.length === 0) return { skipped: "no_recipients", devices: 0, delivered: 0, failed: 0 };

  const admin = createAdminClient();

  const { data: preferences } = await admin
    .from("notification_preferences")
    .select("auth_user_id, event_new, todo_assigned, todo_due_soon, prayer_request, church_announcement, group_post, special_day, team_alert, event_update")
    .in("auth_user_id", authUserIds);

  // "account_deletion" is an alert to church admins with no preference of its
  // own, so nobody is opted out of it.
  const optedOut = new Set(
    category === "account_deletion" ? [] : (preferences ?? []).filter((row) => row[category] === false).map((row) => row.auth_user_id),
  );
  const recipients = authUserIds.filter((id) => !optedOut.has(id));
  if (recipients.length === 0) return { skipped: "opted_out", devices: 0, delivered: 0, failed: 0 };

  // Everyone who is sent a notification also gets it in their in-app inbox
  // (notification center), whether or not push is set up or the phone received it.
  await saveToInboxes(recipients, category, payload);

  if (!isPushConfigured()) return { skipped: "not_configured", devices: 0, delivered: 0, failed: 0 };

  const { data: tokenRows } = await admin.from("device_push_tokens").select("token, platform").in("auth_user_id", recipients);
  const batches = buildPushBatches(tokenRows ?? [], payload);
  const allTokens = (tokenRows ?? []).map((row) => row.token);
  if (allTokens.length === 0) return { skipped: "no_devices", devices: 0, delivered: 0, failed: 0 };

  const responses: { error?: { code: string; message: string } }[] = [];
  const staleTokens: string[] = [];
  let delivered = 0;
  let failed = 0;
  try {
    for (const batch of batches) {
      const response = await getMessaging(getFirebaseApp()).sendEachForMulticast({ tokens: batch.tokens, ...batch.message });
      delivered += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        responses.push(result);
        // A token stops being valid when the app is uninstalled or the user
        // signs out of Firebase on that device — clean those up now rather
        // than paying for the same failed lookup on every future send.
        const code = result.error?.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") staleTokens.push(batch.tokens[index]);
      });
    }
  } catch (error) {
    console.error("sendPushToUsers: FCM send failed", error);
    return { skipped: "send_failed", devices: allTokens.length, delivered, failed: allTokens.length - delivered, error: error instanceof Error ? error.message : String(error) };
  }

  if (staleTokens.length > 0) {
    await admin.from("device_push_tokens").delete().in("token", staleTokens);
  }

  const firstError = responses.find((result) => result.error)?.error;
  if (firstError) console.error("sendPushToUsers: FCM rejected a message", firstError.code, firstError.message);
  return {
    devices: allTokens.length,
    delivered,
    failed,
    error: firstError ? `${firstError.code}: ${firstError.message}` : undefined,
  };
}

// Best-effort: a failure to save to the inbox never stops the push itself.
async function saveToInboxes(recipients: string[], category: PushCategory, payload: PushPayload): Promise<void> {
  try {
    const admin = createAdminClient();
    const link = typeof payload.data?.link === "string" && payload.data.link ? payload.data.link : null;
    const buttonLabel = typeof payload.data?.buttonLabel === "string" && payload.data.buttonLabel ? payload.data.buttonLabel : null;
    await admin.from("member_notifications").insert(
      recipients.map((authUserId) => ({ auth_user_id: authUserId, category, title: payload.title, body: payload.body, link, button_label: buttonLabel })),
    );
  } catch (error) {
    console.error("saveToInboxes failed", error);
  }
}
