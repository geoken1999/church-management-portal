import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getZoomEnv, zoomAuthorizeUrl } from "@/lib/conferencing/zoom";
import { isConnectionSecretsConfigured } from "@/lib/security/connection-secrets";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "zoom_oauth_state";
const BACK = () => `${getSiteUrl()}/dashboard/kconnect/conferencing`;

// Starts connecting the church's Zoom account. The state value is set as an httpOnly cookie and checked on the way
// back, which stops another site from making someone connect the wrong account.
export async function GET() {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return NextResponse.redirect(`${BACK()}?status=forbidden`);
  if (!getZoomEnv() || !isConnectionSecretsConfigured()) return NextResponse.redirect(`${BACK()}?status=not_configured`);

  const state = crypto.randomUUID();
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(zoomAuthorizeUrl(state));
}
