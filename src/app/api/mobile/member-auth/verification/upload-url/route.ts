import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { proofMemberFromRequest } from "@/lib/members/proof-session";
import { PROOF_BUCKET, proofPath, proofProblem } from "@/lib/members/proof";

// Step one of sending a proof document: the app says what it will upload (type and size) and gets a one-time upload
// link for a path the server chose inside the member's own folder. The submit route then names that path.
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

    let body: { type?: unknown; size?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request." },
        { status: 400 },
      );
    }
    const type = typeof body.type === "string" ? body.type : "";
    const size = typeof body.size === "number" ? body.size : 0;
    const problem = proofProblem({ type, size });
    if (problem) return NextResponse.json({ ok: false, error: problem });

    const path = proofPath(
      member.organizationId,
      member.memberId,
      type,
      crypto.randomUUID(),
    );
    const { data, error } = await createAdminClient()
      .storage.from(PROOF_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data)
      return NextResponse.json(
        { ok: false, error: "Couldn't start the upload. Please try again." },
        { status: 500 },
      );
    return NextResponse.json({ ok: true, path, token: data.token });
  } catch (err) {
    console.error("mobile/member-auth/verification/upload-url failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
