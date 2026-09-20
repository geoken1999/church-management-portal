import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { buildAuthorizeUrl } from "@/lib/youtube/client";
import { getYouTubeEnv } from "@/lib/youtube/env";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "yt_oauth_state";

// Kicks off Google's OAuth flow for YouTube. The state value doubles as
// CSRF protection: set as an httpOnly cookie here, checked against
// Google's callback in the route below.
export async function GET() {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/youtube?status=forbidden`);
  }

  try {
    getYouTubeEnv();
  } catch {
    // YOUTUBE_CLIENT_ID/SECRET aren't configured yet — a friendly redirect
    // beats a raw crash page for something an admin can trigger by
    // clicking a button.
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/youtube?status=not_configured`);
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

  const redirectUri = `${getSiteUrl()}/api/youtube/callback`;
  return NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
}
