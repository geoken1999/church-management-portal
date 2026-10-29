import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveFeedback } from "@/lib/feedback/service";
import { parseFeedback } from "@/lib/feedback/validation";

// Feedback sent from inside the mobile app, by anyone signed in (team or member). Who they are comes from
// the session, not from the request.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = parseFeedback(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error });

  const { data, error } = await createAdminClient().auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  const source = raw.platform === "ios" ? "ios" : "android";
  const result = await saveFeedback(source, data.user.id, parsed.feedback);
  return NextResponse.json(result);
}
