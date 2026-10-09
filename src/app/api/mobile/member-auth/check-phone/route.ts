import { NextResponse } from "next/server";
import { matchMemberOrgsByPhone } from "@/lib/members/phone-login";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Called by the mobile app's Member login tab BEFORE it ever asks
// Supabase to send an OTP — purely advisory (a client could skip this and
// call Supabase directly), but it means a number that isn't a real,
// active member doesn't rack up SMS cost or get handed a working session
// in the first place. The real security boundary is elsewhere: an
// unlinked Supabase identity (no members.auth_user_id pointing at it)
// gets no RLS access to anything regardless of whether it has a session.
export async function POST(request: Request) {
  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const phone = String(body.phone ?? "").trim();
  if (!phone) {
    return NextResponse.json({ ok: false, error: "Enter your phone number." });
  }

  const matches = await matchMemberOrgsByPhone(phone);
  const orgIds = new Set(matches.map((m) => m.organizationId));

  if (orgIds.size === 0) {
    return NextResponse.json({ ok: false, error: "No member account was found for this number. Contact your church if you think this is a mistake." });
  }
  if (orgIds.size > 1) {
    await logPlatformEvent({
      level: "warning",
      source: "member_mobile_login",
      message: "Mobile member login: phone number matches members in more than one organization — refused rather than guessing",
      metadata: { orgCount: orgIds.size },
    });
    return NextResponse.json({ ok: false, error: "This number is linked to more than one church. Contact support for help signing in." });
  }

  return NextResponse.json({ ok: true, organizationName: matches[0].organizationName });
}
