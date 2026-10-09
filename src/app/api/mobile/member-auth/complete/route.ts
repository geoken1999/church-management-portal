import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchMemberOrgsByPhone } from "@/lib/members/phone-login";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Called by the mobile app right after supabase.auth.verifyOTP succeeds,
// with that brand-new session's own access token — this is the real
// linking step, and it does NOT trust whatever phone number the client
// claimed earlier (check-phone's result is advisory only). The token is
// verified server-side and its own phone claim is what gets matched,
// closing the gap where someone could check-phone a real member's number
// but then actually verify an OTP sent to a different one.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });
  }

  const verifiedPhone = userData.user.phone;
  if (!verifiedPhone) {
    // A session from the Team (email/password) login flow has no phone
    // claim at all — this route only ever applies to a phone-OTP session.
    return NextResponse.json({ ok: false, error: "This isn't a phone sign-in session." }, { status: 400 });
  }

  const matches = await matchMemberOrgsByPhone(verifiedPhone);
  const orgIds = new Set(matches.map((m) => m.organizationId));

  if (orgIds.size !== 1) {
    await logPlatformEvent({
      level: orgIds.size === 0 ? "info" : "warning",
      source: "member_mobile_login",
      message:
        orgIds.size === 0
          ? "Mobile member login completed OTP but no active member matches this phone — not linked"
          : "Mobile member login completed OTP but the phone matches members in more than one organization — not linked",
      metadata: { authUserId: userData.user.id, orgCount: orgIds.size },
    });
    return NextResponse.json({
      ok: false,
      error:
        orgIds.size === 0
          ? "No member account was found for this number. Contact your church if you think this is a mistake."
          : "This number is linked to more than one church. Contact support for help signing in.",
    });
  }

  const match = matches[0];
  const { error: updateError } = await admin
    .from("members")
    .update({ auth_user_id: userData.user.id })
    .eq("id", match.memberId);

  if (updateError) {
    console.error("members.auth_user_id link failed:", updateError.message);
    return NextResponse.json({ ok: false, error: "Signed in, but couldn't finish setting up your account. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    memberId: match.memberId,
    organizationId: match.organizationId,
    organizationName: match.organizationName,
    firstName: match.firstName,
    lastName: match.lastName,
  });
}
