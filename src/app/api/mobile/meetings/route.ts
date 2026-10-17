import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { tabKeyForMode } from "@/lib/kmeet/mode";
import {
  deleteMeeting,
  endMeeting,
  scheduleMeeting,
  setAdmission,
  startInstantMeeting,
  type MeetingResult,
} from "@/lib/kmeet/mobile-service";
import type { KmeetMode } from "@/types/database";

// The staff mobile app's K-Meet (video) and K-Audio meetings: schedule, start an
// instant one, end, change admission, delete. The meeting's own tab permissions
// apply, as on the web.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const organizationId = text("organizationId");
  const action = text("action");
  const id = text("id");

  // Which tab governs it: the mode sent for new meetings, the meeting's own mode otherwise.
  let mode: KmeetMode = body.mode === "audio" ? "audio" : "video";
  if (id) {
    const { data: meeting } = await createAdminClient()
      .from("kmeet_meetings")
      .select("mode")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!meeting)
      return NextResponse.json(
        { ok: false, error: "That meeting could not be found." },
        { status: 404 },
      );
    mode = meeting.mode;
  }

  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    tabKeyForMode(mode),
    action === "delete" ? "delete" : "write",
  );
  if (auth instanceof NextResponse) return auth;

  let result: MeetingResult = { ok: false, error: "Invalid request." };
  if (action === "schedule") {
    result = await scheduleMeeting(organizationId, auth.userId, {
      mode,
      title: text("title"),
      description: text("description"),
      scheduledAt: text("scheduledAt"),
      eventId: text("eventId"),
      requireAdmission: body.requireAdmission === true,
    });
  } else if (action === "instant") {
    result = await startInstantMeeting(
      organizationId,
      auth.userId,
      mode,
      text("title"),
      body.requireAdmission === true,
    );
  } else if (id && action === "end") {
    result = await endMeeting(organizationId, id);
  } else if (id && action === "admission") {
    result = await setAdmission(
      organizationId,
      id,
      body.requireAdmission === true,
    );
  } else if (id && action === "delete") {
    result = await deleteMeeting(organizationId, id);
  }
  return NextResponse.json(
    result.ok
      ? { ok: true, id: result.id }
      : { ok: false, error: result.error },
  );
}
