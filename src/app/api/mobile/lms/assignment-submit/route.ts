import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToTeam } from "@/lib/push/team";
import { isUuid, memberClientFromRequest } from "@/lib/lms/member-client";
import { ASSIGNMENT_BUCKET, MAX_ANSWER_CHARS } from "@/lib/lms/assignment";
import { LMS_BASE_PATH } from "@/lib/lms/constants";

// Step two: the hand-in itself. The database checks everything (the student is on the course, the file is
// really in their folder, nothing is already marked) and records it. The server then removes a file the
// hand-in replaced and tells the teachers.
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status });

export async function POST(request: Request) {
  try {
    const asMember = memberClientFromRequest(request);
    if (!asMember) return json({ ok: false, error: "Missing session." }, 401);
    let body: {
      lessonId?: unknown;
      text?: unknown;
      path?: unknown;
      name?: unknown;
      size?: unknown;
    } = {};
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
    const text =
      typeof body.text === "string"
        ? body.text.slice(0, MAX_ANSWER_CHARS + 1)
        : null;
    const path = typeof body.path === "string" && body.path ? body.path : null;
    const name = typeof body.name === "string" ? body.name : null;
    const size =
      typeof body.size === "number" && Number.isFinite(body.size)
        ? Math.round(body.size)
        : null;

    const { data, error } = await asMember.rpc("lms_submit_assignment", {
      p_lesson: body.lessonId,
      p_text: text,
      p_file_path: path,
      p_file_name: name,
      p_file_size: size,
    });
    if (error || !data)
      return json({
        ok: false,
        error: error?.message || "Couldn't hand in. Please try again.",
      });

    const admin = createAdminClient();
    if (data.replaced_file) {
      await admin.storage
        .from(ASSIGNMENT_BUCKET)
        .remove([data.replaced_file])
        .catch(() => undefined);
    }
    // Telling the teachers is best effort: the hand-in is saved either way.
    try {
      const [{ data: member }, { data: lesson }] = await Promise.all([
        admin
          .from("members")
          .select("first_name, last_name")
          .eq("id", data.member_id)
          .maybeSingle(),
        admin
          .from("lms_lessons")
          .select("title")
          .eq("id", body.lessonId)
          .maybeSingle(),
      ]);
      await pushToTeam({
        organizationId: data.organization_id,
        tab: "bibleschool",
        title: "Assignment handed in",
        body: `${member ? `${member.first_name} ${member.last_name}`.trim() : "A student"} handed in ${lesson?.title ?? "an assignment"}${data.late ? " (late)" : ""}.`,
        link: `${LMS_BASE_PATH}/grading`,
      });
    } catch {
      /* ignored */
    }
    return json({ ok: true, late: data.late });
  } catch (err) {
    console.error("mobile/lms/assignment-submit POST failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
