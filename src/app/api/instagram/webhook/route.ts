import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getInstagramEnv } from "@/lib/instagram/env";
import { getValidAccessToken } from "@/lib/instagram/token";
import { fetchConversationMessagesByParticipant, sendMessage, sendPrivateReply } from "@/lib/instagram/client";
import { generateReply, type ChatTurn } from "@/lib/ai/openai";
import {
  findConnectionByMessagingId,
  getAiModeForWebhook,
  findMatchingCommentAutomation,
  hasAlreadyRepliedToComment,
  recordCommentReply,
} from "@/lib/instagram/automation";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Meta's webhook verification handshake, run once when the Callback URL is
// saved in the App Dashboard (API setup with Instagram login -> Configure
// webhooks). Echoing back hub.challenge as plain text is what the handshake
// requires — anything else (JSON, wrapping it in a body) fails verification.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface MessagingEvent {
  sender?: { id?: string };
  message?: { text?: string; is_echo?: boolean };
}

interface CommentChange {
  field?: string;
  value?: {
    id?: string;
    text?: string;
    from?: { id?: string };
    media?: { id?: string };
  };
}

interface WebhookEntry {
  id?: string;
  messaging?: MessagingEvent[];
  changes?: CommentChange[];
}

interface WebhookPayload {
  entry?: WebhookEntry[];
}

const AI_SYSTEM_PROMPT =
  "You are replying to Instagram direct messages on behalf of a church's Instagram account. " +
  "Keep replies short, warm, and natural, like a real person texting back. Never mention that you are an AI.";

// Temporary verbose logging while tracking down why AI mode sometimes
// doesn't reply at all (no error logged, just silence) — every exit point
// logs which one it took, so the next real test pinpoints the exact
// checkpoint instead of guessing. Remove once AI mode is confirmed stable.
async function handleMessagingEvent(businessMessagingId: string, event: MessagingEvent): Promise<void> {
  const senderId = event.sender?.id;
  const text = event.message?.text;
  const isEcho = event.message?.is_echo;

  await logPlatformEvent({
    level: "info",
    source: "instagram_webhook",
    message: "messaging event received",
    metadata: { businessMessagingId, senderId, hasText: !!text, isEcho },
  });

  // is_echo is Meta's own copy of a message *we* sent, delivered back
  // through the same webhook — without this check, every AI (or human)
  // reply would immediately re-trigger this handler on itself.
  if (!senderId || !text || isEcho || senderId === businessMessagingId) {
    await logPlatformEvent({
      level: "info",
      source: "instagram_webhook",
      message: "messaging event skipped: missing sender/text, echo, or self",
      metadata: { businessMessagingId, senderId, isEcho },
    });
    return;
  }

  const connection = await findConnectionByMessagingId(businessMessagingId);
  if (!connection) {
    await logPlatformEvent({
      level: "warning",
      source: "instagram_webhook",
      message: "messaging event skipped: no connection found for messaging id",
      metadata: { businessMessagingId },
    });
    return;
  }

  const aiEnabled = await getAiModeForWebhook(connection.organization_id, senderId);
  if (!aiEnabled) {
    await logPlatformEvent({
      level: "info",
      source: "instagram_webhook",
      message: "messaging event skipped: AI mode is off for this participant",
      organizationId: connection.organization_id,
      metadata: { senderId },
    });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const recent = await fetchConversationMessagesByParticipant(accessToken, senderId, 10);
    const history: ChatTurn[] = recent
      .filter((m) => m.text)
      .map((m) => ({
        role: m.fromUsername === connection.username ? "assistant" : "user",
        content: m.text as string,
      }));

    await logPlatformEvent({
      level: "info",
      source: "instagram_webhook",
      message: "generating AI reply",
      organizationId: connection.organization_id,
      metadata: { senderId, historyLength: history.length },
    });

    const reply = await generateReply(AI_SYSTEM_PROMPT, history);
    if (!reply) {
      await logPlatformEvent({
        level: "warning",
        source: "instagram_webhook",
        message: "AI reply generation returned empty content",
        organizationId: connection.organization_id,
        metadata: { senderId },
      });
      return;
    }

    // No tag here, ever: HUMAN_AGENT is reserved by Meta's policy for a
    // genuine human responding, explicitly prohibited for automated
    // messages — and unnecessary anyway, since this fires immediately off
    // an inbound message, well inside the normal 24-hour window.
    await sendMessage(accessToken, senderId, reply);
    await logPlatformEvent({
      level: "info",
      source: "instagram_webhook",
      message: "AI reply sent",
      organizationId: connection.organization_id,
      metadata: { senderId },
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "instagram_webhook",
      message: `AI auto-reply failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: connection.organization_id,
    });
  }
}

async function handleCommentChange(businessMessagingId: string, change: CommentChange): Promise<void> {
  const value = change.value;
  const commentId = value?.id;
  const mediaId = value?.media?.id;
  const text = value?.text;
  // Skip comments the business account made itself (e.g. its own reply to
  // a comment) — otherwise a reply could in principle chain into itself.
  if (!commentId || !mediaId || !text || value?.from?.id === businessMessagingId) return;

  const connection = await findConnectionByMessagingId(businessMessagingId);
  if (!connection) return;

  // Meta allows exactly one private reply per comment and will redeliver
  // webhook events on occasion — check first so a redelivery never risks a
  // second DM (and never spends an API call finding a rule for nothing).
  if (await hasAlreadyRepliedToComment(commentId)) return;

  const automation = await findMatchingCommentAutomation(connection.organization_id, mediaId, text);
  if (!automation) return;

  try {
    const accessToken = await getValidAccessToken(connection);
    // A comment delivered via webhook can momentarily precede Instagram's
    // own backend having it fully indexed — observed directly as a private
    // reply failing once with Meta's generic "An unknown error has
    // occurred" and then succeeding seconds later on an identical retry.
    // One retry after a short pause covers that without risking a double
    // send (hasAlreadyRepliedToComment above already guards redeliveries;
    // this is the same request, not a new delivery).
    try {
      await sendPrivateReply(accessToken, commentId, automation.reply_template);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await sendPrivateReply(accessToken, commentId, automation.reply_template);
    }
    await recordCommentReply(connection.organization_id, commentId, automation.id);
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "instagram_webhook",
      message: `Comment automation reply failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: connection.organization_id,
    });
  }
}

export async function POST(request: Request) {
  const { appSecret } = getInstagramEnv();
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  if (!signature?.startsWith("sha256=")) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signature.slice("sha256=".length);
  const isValid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Not valid JSON — nothing to process, but still ack so Meta doesn't
    // treat this as a failure and retry-storm the endpoint.
    return NextResponse.json({ received: true });
  }

  for (const entry of payload.entry ?? []) {
    const businessMessagingId = entry.id;
    if (!businessMessagingId) continue;

    for (const event of entry.messaging ?? []) {
      await handleMessagingEvent(businessMessagingId, event).catch(() => {});
    }
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") {
        await handleCommentChange(businessMessagingId, change).catch(() => {});
      }
    }
  }

  return NextResponse.json({ received: true });
}
