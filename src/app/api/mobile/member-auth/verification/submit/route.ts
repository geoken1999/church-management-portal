import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { proofMemberFromRequest } from "@/lib/members/proof-session";
import { PROOF_BUCKET, isOwnProofPath } from "@/lib/members/proof";
import { pushToTeam } from "@/lib/push/team";

// Step two: the file is in storage; record it against the member and tell the church there is something to review.
export async function POST(request: Request) {
  try {
    const member = await proofMemberFromRequest(request);
    if (!member)
      return NextResponse.json(
        { ok: false, error: "That session could not be verified." },
        { status: 401 },
      );
    if (!member.selfRegistered || member.status === "verified")
      return NextResponse.json({
        ok: false,
        error: "You don't need to send a proof document.",
      });

    let body: { path?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request." },
        { status: 400 },
      );
    }
    const path = typeof body.path === "string" ? body.path : "";
    if (!isOwnProofPath(path, member.organizationId, member.memberId))
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

    const admin = createAdminClient();
    const folder = path.slice(0, path.lastIndexOf("/"));
    const file = path.slice(path.lastIndexOf("/") + 1);
    const { data: found } = await admin.storage
      .from(PROOF_BUCKET)
      .list(folder, { search: file });
    if (!found?.some((f) => f.name === file))
      return NextResponse.json({
        ok: false,
        error: "The file didn't finish uploading. Please try again.",
      });

    const { error } = await admin
      .from("members")
      .update({
        proof_document_path: path,
        proof_submitted_at: new Date().toISOString(),
        verification_status: "under_review",
        verification_note: null,
      })
      .eq("id", member.memberId);
    if (error) {
      console.error("members proof update failed:", error.message);
      return NextResponse.json(
        { ok: false, error: "Couldn't save your document. Please try again." },
        { status: 500 },
      );
    }

    await pushToTeam({
      organizationId: member.organizationId,
      tab: "members",
      title: "Proof document to review",
      body: `${member.firstName} ${member.lastName}`.trim() + " sent a proof document.",
      link: "/dashboard/members",
    });
    return NextResponse.json({ ok: true, status: "under_review" });
  } catch (err) {
    console.error("mobile/member-auth/verification/submit failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
