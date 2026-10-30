"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, getConferenceMeeting, getConnection } from "@/lib/conferencing/dal";
import { createZoomMeeting, deleteZoomMeeting, fetchZoomZak, getZoomEnv, ZOOM_SDK_VERSION } from "@/lib/conferencing/zoom";
import { createMeetSpace } from "@/lib/conferencing/google-meet";
import { zoomSignature } from "@/lib/conferencing/zoom-signature";
import { notifyConferenceStarted } from "@/lib/conferencing/notify";

const PATH = "/dashboard/kconnect/conferencing";

export interface ConferencingResult {
  error?: string;
}

// Anyone who can use K-Connect video may create meetings on the church's connected accounts; connecting and
// disconnecting an account is for owners and admins only.
async function gate(level: "read" | "write") {
  const user = await requireUser();
  const membership = await requireOrganization();
  const access = await checkTabAccess(membership.organization.id, "kmeet", level);
  if (!access.ok) return { error: access.message } as const;
  return { organizationId: membership.organization.id, userId: user.id, timezone: membership.organization.timezone || "UTC", role: membership.role } as const;
}

export async function createZoomMeetingAction(input: { title: string; startsAt?: string; durationMinutes: number }): Promise<ConferencingResult & { id?: string }> {
  const g = await gate("write");
  if ("error" in g) return g;
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give the meeting a title." };
  const duration = Math.round(Number(input.durationMinutes));
  if (!Number.isFinite(duration) || duration < 5 || duration > 1440) return { error: "Choose a length between 5 minutes and 24 hours." };
  let startTime: string | undefined;
  if (input.startsAt) {
    const when = new Date(input.startsAt);
    if (Number.isNaN(when.getTime())) return { error: "That start time isn't valid." };
    startTime = when.toISOString();
  }
  const connection = await getConnection(g.organizationId, "zoom");
  if (!connection) return { error: "Connect your Zoom account first." };
  try {
    const token = await getAccessToken(connection);
    const meeting = await createZoomMeeting(token, { topic: title, startTime, durationMinutes: duration, timezone: "UTC" });
    const { data, error } = await createAdminClient()
      .from("conference_meetings")
      .insert({ organization_id: g.organizationId, provider: "zoom", external_id: meeting.id, title, start_time: startTime ?? null, duration_minutes: duration, join_url: meeting.joinUrl, passcode: meeting.passcode, created_by: g.userId })
      .select("id")
      .single();
    if (error || !data) return { error: "The meeting was made in Zoom but couldn't be saved here. Please try again." };
    revalidatePath(PATH);
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the Zoom meeting." };
  }
}

export async function createMeetRoomAction(input: { title: string }): Promise<ConferencingResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give the room a title." };
  const connection = await getConnection(g.organizationId, "google_meet");
  if (!connection) return { error: "Connect your Google account first." };
  try {
    const space = await createMeetSpace(await getAccessToken(connection));
    const { data, error } = await createAdminClient()
      .from("conference_meetings")
      .insert({ organization_id: g.organizationId, provider: "google_meet", external_id: space.name, title, join_url: space.meetingUri, created_by: g.userId })
      .select("id")
      .single();
    if (error || !data) return { error: "The room was made in Google Meet but couldn't be saved here. Please try again." };
    await notifyConferenceStarted(data.id, g.userId);
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the Google Meet room." };
  }
}

export async function deleteConferenceMeetingAction(id: string): Promise<ConferencingResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  const meeting = await getConferenceMeeting(g.organizationId, id);
  if (!meeting) return {};
  // A Zoom meeting is cancelled in Zoom too; if that fails (already gone), it still leaves the list.
  if (meeting.provider === "zoom") {
    const connection = await getConnection(g.organizationId, "zoom");
    if (connection) {
      try {
        await deleteZoomMeeting(await getAccessToken(connection), meeting.external_id);
      } catch {
        // already deleted or ended
      }
    }
  }
  await createAdminClient().from("conference_meetings").delete().eq("id", id).eq("organization_id", g.organizationId);
  revalidatePath(PATH);
  return {};
}

export async function disconnectConferencingAction(provider: "zoom" | "google_meet"): Promise<ConferencingResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  if (g.role !== "owner" && g.role !== "admin") return { error: "Only an owner or admin can disconnect an account." };
  await createAdminClient().from("conference_connections").delete().eq("organization_id", g.organizationId).eq("provider", provider);
  revalidatePath(PATH);
  return {};
}

export interface ZoomJoinDetails {
  error?: string;
  sdkKey?: string;
  signature?: string;
  meetingNumber?: string;
  passcode?: string;
  userName?: string;
  zak?: string;
  sdkVersion?: string;
  // Opens the meeting as host in the Zoom app, for when the in-page window can't start it.
  startUrl?: string;
}

/**
 * What the browser needs to put the person into a Zoom meeting inside KingdomFlow. Starting it (as the host) uses the
 * church account's one-time key, so anyone with K-Connect access can start the church's meeting; joining is as a guest.
 */
export async function getZoomJoinAction(id: string, as: "host" | "guest"): Promise<ZoomJoinDetails> {
  const g = await gate("read");
  if ("error" in g) return g;
  if (as === "host" && "error" in (await gate("write"))) return { error: "You can join this meeting, but only people who can use K-Connect fully may start it." };
  const env = getZoomEnv();
  if (!env) return { error: "Zoom isn't set up on this server yet." };
  const meeting = await getConferenceMeeting(g.organizationId, id);
  if (!meeting || meeting.provider !== "zoom") return { error: "That meeting wasn't found." };
  const { data: profile } = await createAdminClient().from("profiles").select("first_name, last_name").eq("auth_user_id", g.userId).maybeSingle();
  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "KingdomFlow guest";
  let zak: string | undefined;
  if (as === "host") {
    const connection = await getConnection(g.organizationId, "zoom");
    if (!connection) return { error: "Connect your Zoom account first." };
    try {
      zak = await fetchZoomZak(await getAccessToken(connection));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't start the meeting as host." };
    }
  }
  return {
    sdkKey: env.clientId,
    signature: zoomSignature({ sdkKey: env.clientId, sdkSecret: env.clientSecret, meetingNumber: meeting.external_id, role: as === "host" ? 1 : 0 }),
    meetingNumber: meeting.external_id,
    passcode: meeting.passcode ?? "",
    userName,
    zak,
    sdkVersion: ZOOM_SDK_VERSION,
    startUrl: zak ? `https://zoom.us/s/${meeting.external_id}?zak=${encodeURIComponent(zak)}` : undefined,
  };
}

/** Called once the host is actually in the meeting, so members are only told about a meeting that really started. */
export async function zoomMeetingStartedAction(id: string): Promise<void> {
  const g = await gate("write");
  if ("error" in g) return;
  const meeting = await getConferenceMeeting(g.organizationId, id);
  if (meeting?.provider === "zoom") await notifyConferenceStarted(meeting.id, g.userId);
}
