import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, memberClientFromRequest } from "@/lib/lms/member-client";
import {
  ASSIGNMENT_BUCKET,
  submissionFileProblem,
  submissionPath,
} from "@/lib/lms/assignment";

// Step one of handing in a file: the student says which assignment and what file (name and size), the
// database says whether they may hand it in, and they get a one-time upload link for a path the server
// chose inside their own folder. The file then goes straight to storage; the hand-in that follows names
// that path (assignment-submit).
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status });

export async function POST(request: Request) {
  try {
    const asMember = memberClientFromRequest(request);
    if (!asMember) return json({ ok: false, error: "Missing session." }, 401);
    let body: { lessonId?: unknown; name?: unknown; size?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid request." }, 400);
    }
    if (!isUuid(body.lessonId))
      return json(
        { ok: false, error: "That assignment could not be found." },
        404,
      );
    const name = typeof body.name === "string" ? body.name : "";
    const size = typeof body.size === "number" ? body.size : 0;
    const problem = submissionFileProblem({ name, size });
    if (problem) return json({ ok: false, error: problem });

    const { data: slot, error } = await asMember.rpc(
      "lms_assignment_upload_slot",
      { p_lesson: body.lessonId },
    );
    if (error || !slot)
      return json(
        {
          ok: false,
          error: error?.message || "You can't hand in this assignment.",
        },
        403,
      );

    const path = submissionPath(
      slot.organization_id,
      slot.member_id,
      body.lessonId,
      name,
      crypto.randomUUID(),
    );
    const { data, error: signError } = await createAdminClient()
      .storage.from(ASSIGNMENT_BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !data)
      return json(
        { ok: false, error: "Couldn't start the upload. Please try again." },
        500,
      );
    return json({ ok: true, path, token: data.token });
  } catch (err) {
    console.error("mobile/lms/assignment-upload POST failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
