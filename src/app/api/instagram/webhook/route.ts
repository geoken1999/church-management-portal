import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getInstagramEnv } from "@/lib/instagram/env";

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

// Meta POSTs here for every subscribed event (messages, comments, etc.).
// This app reads Instagram data by polling the Graph API on page load
// rather than building state from webhook events, so there's nothing to
// process — an active, verified subscription is what's required for
// Instagram to index conversations at all; the payload itself is unused.
// Still verifies the signature so an unauthenticated caller can't spoof
// traffic to this endpoint.
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

  return NextResponse.json({ received: true });
}
