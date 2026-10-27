import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { proofMemberFromRequest } from "@/lib/members/proof-session";
import { proofDeadline } from "@/lib/members/proof";

// The member's own verification state for the app. The 2 minutes start the first time the app asks (that is, when
// they first open it), and the server's clock is sent back so the countdown does not depend on the phone's clock.
export async function GET(request: Request) {
  try {
    const member = await proofMemberFromRequest(request);
    if (!member)
      return NextResponse.json(
        { ok: false, error: "That session could not be verified." },
        { status: 401 },
      );

    let startedAt = member.startedAt;
    if (member.selfRegistered && !startedAt) {
      startedAt = new Date().toISOString();
      await createAdminClient()
        .from("members")
        .update({ verification_started_at: startedAt })
        .eq("id", member.memberId)
        .is("verification_started_at", null);
    }

    return NextResponse.json({
      ok: true,
      selfRegistered: member.selfRegistered,
      status: member.status,
      note: member.note,
      deadlineAt: startedAt && member.selfRegistered ? proofDeadline(startedAt) : null,
      serverNow: new Date().toISOString(),
    });
  } catch (err) {
    console.error("mobile/member-auth/verification GET failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
