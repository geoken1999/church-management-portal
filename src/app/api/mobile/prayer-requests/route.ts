import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationForWebhook } from "@/lib/notifications/create";
import { sendPushToUsers } from "@/lib/push/client";
import { normalizeTabPermissions } from "@/lib/permissions/tabs";
import {
  MAX_PRAYER_REQUESTS_PER_DAY,
  parsePrayerRequestInput,
  prayerNotificationBody,
  prayerWallNotice,
} from "@/lib/prayer/validation";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import { logPlatformEvent } from "@/lib/platform-events/log";
import {
  isOwnPrayerAudioPath,
  MAX_PRAYER_AUDIO_BYTES,
  PRAYER_AUDIO_BUCKET,
} from "@/lib/prayer/audio";

// A member raising a prayer request from the mobile app. Goes through the
// server (not a direct insert from the phone) because it also has to tell
// the church team: a bell notification on the web and a push to the team
// members who use the app. The member is identified from their own session
// token, never from anything in the request body.
export async function POST(request: Request) {
  try {
    return await handleCreate(request);
  } catch (err) {
    console.error("mobile/prayer-requests/route.ts POST failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

async function handleCreate(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const { input, error: inputError } = parsePrayerRequestInput(body);
  if (inputError || !input)
    return NextResponse.json({
      ok: false,
      error: inputError ?? "Write your prayer request.",
    });

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  const { data: member } = await admin
    .from("members")
    .select("id, first_name, last_name, organization_id, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member || member.status !== "active") {
    return NextResponse.json(
      {
        ok: false,
        error: "No active member account is linked to this session.",
      },
      { status: 404 },
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("prayer_requests")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PRAYER_REQUESTS_PER_DAY) {
    return NextResponse.json({
      ok: false,
      error: `You can share up to ${MAX_PRAYER_REQUESTS_PER_DAY} prayer requests a day. Please try again tomorrow.`,
    });
  }

  // A voice message must be one this member just uploaded to their own folder, and really be there.
  if (input.audioPath) {
    if (
      !isOwnPrayerAudioPath(input.audioPath, member.organization_id, member.id)
    )
      return NextResponse.json({
        ok: false,
        error: "That voice message could not be used. Please record it again.",
      });
    const slash = input.audioPath.lastIndexOf("/");
    const { data: found } = await admin.storage
      .from(PRAYER_AUDIO_BUCKET)
      .list(input.audioPath.slice(0, slash), {
        search: input.audioPath.slice(slash + 1),
        limit: 1,
      });
    const object = (found ?? []).find(
      (f) => f.name === input.audioPath!.slice(slash + 1),
    );
    const size = Number(
      (object?.metadata as { size?: number } | null)?.size ?? 0,
    );
    if (!object || size <= 0 || size > MAX_PRAYER_AUDIO_BYTES)
      return NextResponse.json({
        ok: false,
        error: "The voice message did not upload. Please try again.",
      });
  }

  const { data: created, error: insertError } = await admin
    .from("prayer_requests")
    .insert({
      organization_id: member.organization_id,
      member_id: member.id,
      request: input.request,
      visibility: input.visibility,
      is_anonymous: input.isAnonymous,
      audio_path: input.audioPath,
      audio_seconds: input.audioSeconds,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    console.error("prayer_requests insert failed:", insertError?.message);
    return NextResponse.json(
      {
        ok: false,
        error: "Couldn't send your prayer request. Please try again.",
      },
      { status: 500 },
    );
  }

  // Telling the team is best-effort: the request is already saved, so a
  // failed notification never turns this into an error for the member.
  try {
    const memberName = `${member.first_name} ${member.last_name}`.trim();
    const notificationBody = prayerNotificationBody(
      memberName,
      input.visibility,
    );

    await createNotificationForWebhook({
      organizationId: member.organization_id,
      type: "prayer_request",
      title: "New prayer request",
      body: notificationBody,
      link: "/dashboard/prayer",
    });

    // The team: owners and admins, plus anyone whose permissions let them
    // view the Prayer tab.
    const { data: team } = await admin
      .from("organization_members")
      .select("auth_user_id, role, tab_permissions")
      .eq("organization_id", member.organization_id);
    const recipients = (team ?? [])
      .filter(
        (row) =>
          row.role === "owner" ||
          row.role === "admin" ||
          normalizeTabPermissions(row.tab_permissions).prayer.read,
      )
      .map((row) => row.auth_user_id);
    await sendPushToUsers(recipients, "prayer_request", {
      title: "New prayer request",
      body: notificationBody,
      data: { type: "prayer_request", link: "/dashboard/prayer" },
    });

    // A request shared with the whole church lands on the prayer wall, so every
    // member with the app hears about it too (not the person who wrote it, and
    // not the team again). A private one goes to the team only.
    if (input.visibility === "shared") {
      const alreadyNotified = new Set([...recipients, userData.user.id]);
      const everyone = (
        await resolveAudienceAuthIds(member.organization_id, { type: "church" })
      ).filter((id) => !alreadyNotified.has(id));
      const notice = prayerWallNotice(member.first_name, input.isAnonymous);
      await sendPushToUsers(everyone, "prayer_request", {
        ...notice,
        data: { type: "prayer_wall" },
      });
    }
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "member_mobile_login",
      message: `Prayer request saved but notifying the team failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: member.organization_id,
    });
  }

  return NextResponse.json({ ok: true, id: created.id });
}
