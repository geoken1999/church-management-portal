import { NextResponse } from "next/server";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";

// "Forgot password" from the mobile app's Team sign-in: emails the same reset link
// the web sends. The answer is always the same, so it can't reveal who has an
// account. One email per address a minute, so it can't be used to flood an inbox.
const GENERIC =
  "If an account exists for that email, we've sent a link to reset your password.";
const lastSent = new Map<string, number>();

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  if (!email || !email.includes("@") || email.length > 200)
    return NextResponse.json({ ok: false, error: "Enter a valid email." });

  const now = Date.now();
  const previous = lastSent.get(email);
  if (previous && now - previous < 60_000)
    return NextResponse.json({ ok: true, message: GENERIC });
  lastSent.set(email, now);
  if (lastSent.size > 5000) lastSent.clear();

  await sendPasswordResetLink(email);
  return NextResponse.json({ ok: true, message: GENERIC });
}
