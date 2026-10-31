// Works out the FCM messages for a push. Pure, so the rule is testable.
//
// A normal push is an FCM "notification" message: the phone's system shows it,
// and it can't carry extra buttons. A push with a link AND a button label gets
// a button on Android: those devices get a data-only message instead, which the
// app turns into its own notification with the button. iPhones can't show a
// button with custom text, so they still get the normal notification, and the
// button appears when it is tapped.

import { iosCategoryFor } from "@/lib/push/button-presets";

export interface PushTokenRow {
  token: string;
  platform: string;
}

export interface PushMessageInput {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushBatch {
  tokens: string[];
  message: {
    notification?: { title: string; body: string };
    data?: Record<string, string>;
    android?: { priority: "high"; notification?: { channelId: string; sound?: string } };
    apns?: { headers: { "apns-priority": string }; payload: { aps: { sound: string; category?: string } } };
  };
}

// The channel the app creates at the top "urgent" importance (lib/services/push_notification_service.dart). A
// notification Firebase shows itself while the app is closed uses the channel named here; without one it lands on
// Firebase's default channel, which is only normal importance (no pop-up on the screen).
export const ANDROID_CHANNEL_ID = "kingdomflow_priority";

export function hasActionButton(data: Record<string, string> | undefined): boolean {
  return Boolean(data?.link && data?.buttonLabel);
}

export function buildPushBatches(rows: PushTokenRow[], payload: PushMessageInput): PushBatch[] {
  const action = hasActionButton(payload.data);
  const androidTokens = action ? rows.filter((r) => r.platform === "android").map((r) => r.token) : [];
  const standardTokens = rows.filter((r) => !androidTokens.includes(r.token)).map((r) => r.token);

  const batches: PushBatch[] = [];
  if (standardTokens.length > 0) {
    batches.push({
      tokens: standardTokens,
      message: {
        notification: { title: payload.title, body: payload.body },
        // iPhones: the category makes the system show the button, and the payload
        // is what the app reads back when the button is tapped.
        data: action
          ? { ...payload.data, payload: JSON.stringify({ title: payload.title, body: payload.body, data: { link: payload.data?.link, buttonLabel: payload.data?.buttonLabel } }) }
          : payload.data,
        // iPhones only play a sound for a notification that asks for one, and deliver at once when sent with
        // priority 10. Android tokens in this batch ignore the apns block.
        android: { priority: "high", notification: { channelId: ANDROID_CHANNEL_ID, sound: "default" } },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default", ...(action ? { category: iosCategoryFor(payload.data?.buttonLabel ?? "") } : {}) } },
        },
      },
    });
  }
  if (androidTokens.length > 0) {
    batches.push({
      tokens: androidTokens,
      message: { data: { ...payload.data, title: payload.title, body: payload.body }, android: { priority: "high" } },
    });
  }
  return batches;
}
