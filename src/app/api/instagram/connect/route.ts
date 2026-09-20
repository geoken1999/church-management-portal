import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { buildAuthorizeUrl } from "@/lib/instagram/client";
import { getInstagramEnv } from "@/lib/instagram/env";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "ig_oauth_state";

// Kicks off the "Instagram API with Instagram Login" OAuth flow. The state
// value doubles as CSRF protection: it's set as an httpOnly cookie here and
// checked against Instagram's callback in the route below, so a forged
// callback request (without that cookie) can't complete a connection.
export async function GET() {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/instagram?status=forbidden`);
  }

  try {
    getInstagramEnv();
  } catch {
    // INSTAGRAM_APP_ID/SECRET aren't configured yet — a friendly redirect
    // beats a raw crash page for something an admin can trigger by clicking
    // a button.
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/instagram?status=not_configured`);
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = `${getSiteUrl()}/api/instagram/callback`;
  return NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
}
