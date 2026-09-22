import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { buildAuthorizeUrl } from "@/lib/facebook/client";
import { getFacebookEnv } from "@/lib/facebook/env";
import { getSiteUrl } from "@/lib/site-url";
import { getPlanUsage } from "@/lib/plans/dal";

const STATE_COOKIE = "fb_oauth_state";

// Standard Facebook Login OAuth flow. The state value doubles as CSRF
// protection: set as an httpOnly cookie here, checked against Facebook's
// callback in the route below.
export async function GET() {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/facebook?status=forbidden`);
  }

  const { plan } = await getPlanUsage(membership.organization.id);
  if (!plan.socialMediaEnabled) {
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/facebook`);
  }

  try {
    getFacebookEnv();
  } catch {
    // FACEBOOK_APP_ID/SECRET aren't configured yet — a friendly redirect
    // beats a raw crash page for something an admin can trigger by
    // clicking a button.
    return NextResponse.redirect(`${getSiteUrl()}/dashboard/facebook?status=not_configured`);
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

  const redirectUri = `${getSiteUrl()}/api/facebook/callback`;
  return NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
}
