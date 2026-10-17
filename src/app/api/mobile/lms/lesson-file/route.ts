import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

// Hands a signed-in member a short-lived link to a lesson's private file. The decision whether they
// may have it is made by the database, with the member's own session (lms_lesson_file_access checks
// that they are enrolled, the lesson is published and any earlier lesson is done); this route only
// signs the link for the path the database returns. The storage path is never sent to the app.
export const dynamic = "force-dynamic";

const LINK_SECONDS = 300;

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  const lessonId = new URL(request.url).searchParams.get("lessonId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(lessonId))
    return NextResponse.json(
      { ok: false, error: "That lesson could not be found." },
      { status: 404 },
    );

  const { url, anonKey } = getSupabaseEnv();
  const asMember = createSupabaseClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: path, error } = await asMember.rpc("lms_lesson_file_access", {
    p_lesson: lessonId,
  });
  if (error)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  if (!path)
    return NextResponse.json(
      { ok: false, error: "You can't open this file." },
      { status: 403 },
    );

  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("file_name")
    .eq("id", lessonId)
    .maybeSingle();
  const { data, error: signError } = await admin.storage
    .from("lms-lesson-files")
    .createSignedUrl(path, LINK_SECONDS);
  if (signError || !data)
    return NextResponse.json(
      { ok: false, error: "Couldn't open that file." },
      { status: 500 },
    );
  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    name: lesson?.file_name ?? "Lesson file",
    expiresInSeconds: LINK_SECONDS,
  });
}
