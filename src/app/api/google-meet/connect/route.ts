import { NextResponse } from "next/server";
import { makeOAuthState } from "@/lib/conferencing/oauth-state";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMeetEnv, meetAuthorizeUrl } from "@/lib/conferencing/google-meet";
import { isConnectionSecretsConfigured } from "@/lib/security/connection-secrets";
import { getSiteUrl } from "@/lib/site-url";

const BACK = () => `${getSiteUrl()}/dashboard/kconnect/conferencing`;

// Starts connecting the church's Google Meet account. The state value is signed (see oauth-state.ts) and checked on the way back.
export async function GET() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return NextResponse.redirect(`${BACK()}?status=forbidden`);
  if (!getMeetEnv() || !isConnectionSecretsConfigured()) return NextResponse.redirect(`${BACK()}?status=not_configured`);

  const state = makeOAuthState(user.id, membership.organization.id, "google_meet");
  return NextResponse.redirect(meetAuthorizeUrl(state));
}
