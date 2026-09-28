import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPushEnv, isPushConfigured } from "@/lib/push/env";

export type PushCategory = "event_new" | "todo_assigned" | "todo_due_soon";

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
export async function sendPushToUsers(authUserIds: string[], category: PushCategory, payload: PushPayload): Promise<void> {
  if (authUserIds.length === 0 || !isPushConfigured()) return;

  const admin = createAdminClient();

  const { data: preferences } = await admin
    .from("notification_preferences")
    .select("auth_user_id, event_new, todo_assigned, todo_due_soon")
    .in("auth_user_id", authUserIds);

  const optedOut = new Set(
    (preferences ?? []).filter((row) => row[category] === false).map((row) => row.auth_user_id),
  );
  const recipients = authUserIds.filter((id) => !optedOut.has(id));
  if (recipients.length === 0) return;

  const { data: tokenRows } = await admin.from("device_push_tokens").select("token").in("auth_user_id", recipients);
  const tokens = (tokenRows ?? []).map((row) => row.token);
  if (tokens.length === 0) return;

  let response;
  try {
    response = await getMessaging(getFirebaseApp()).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });
  } catch (error) {
    console.error("sendPushToUsers: FCM send failed", error);
    return;
  }

  // A token stops being valid when the app is uninstalled or the user
  // signs out of Firebase on that device — clean those up now rather than
  // paying for the same failed lookup on every future send.
  const staleTokens = response.responses
    .map((result, index) => ({ result, token: tokens[index] }))
    .filter(({ result }) => {
      const code = result.error?.code;
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
    })
    .map(({ token }) => token);

  if (staleTokens.length > 0) {
    await admin.from("device_push_tokens").delete().in("token", staleTokens);
  }
}
