import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, memberClientFromRequest } from "@/lib/lms/member-client";
import { ASSIGNMENT_BUCKET } from "@/lib/lms/assignment";

// A short-lived link to the student's own handed-in file. The database says which file is theirs.
export const dynamic = "force-dynamic";

const LINK_SECONDS = 300;

export async function GET(request: Request) {
  const asMember = memberClientFromRequest(request);
  if (!asMember)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );
  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!isUuid(lessonId))
    return NextResponse.json(
      { ok: false, error: "That assignment could not be found." },
      { status: 404 },
    );
  const { data, error } = await asMember.rpc("lms_my_submission_file", {
    p_lesson: lessonId,
  });
  const file = data?.[0];
  if (error || !file)
    return NextResponse.json(
      { ok: false, error: "There is no file to open." },
      { status: 404 },
    );
  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(ASSIGNMENT_BUCKET)
    .createSignedUrl(file.file_path, LINK_SECONDS, {
      download: file.file_name || true,
    });
  if (signError || !signed)
    return NextResponse.json(
      { ok: false, error: "Couldn't open that file." },
      { status: 500 },
    );
  return NextResponse.json({
    ok: true,
    url: signed.signedUrl,
    name: file.file_name,
    expiresInSeconds: LINK_SECONDS,
  });
}
