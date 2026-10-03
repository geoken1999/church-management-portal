"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { generateParticipantToken } from "@/lib/kmeet/token";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";

const KMEET_PATH = "/dashboard/kmeet";

export interface KmeetFormState {
  error?: string;
  meetingId?: string;
}

export async function scheduleMeetingAction(_prevState: KmeetFormState, formData: FormData): Promise<KmeetFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.write) {
    return { error: "You don't have permission to schedule a meeting." };
  }
  if (!isVideoSdkConfigured()) {
    return { error: "Video calling isn't configured yet — ask your developer to set it up." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();

  if (!title) return { error: "Give the meeting a title." };

  const scheduledAt = new Date(scheduledAtRaw);
  if (!scheduledAtRaw || Number.isNaN(scheduledAt.getTime())) return { error: "Choose a valid date and time." };
  if (scheduledAt.getTime() < Date.now() - 60_000) return { error: "Choose a time in the future." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title,
      description: description || null,
      event_id: eventId || null,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't schedule that meeting. Please try again." };

  revalidatePath(KMEET_PATH);
  return { meetingId: data.id };
}

export async function startInstantMeetingAction(title: string): Promise<KmeetFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.write) {
    return { error: "You don't have permission to start a meeting." };
  }
  if (!isVideoSdkConfigured()) {
    return { error: "Video calling isn't configured yet — ask your developer to set it up." };
  }

  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the meeting." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title: title.trim() || "Instant meeting",
      room_id: roomId,
      status: "live",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't start that meeting. Please try again." };

  revalidatePath(KMEET_PATH);
  return { meetingId: data.id };
}

export interface JoinMeetingResult {
  error?: string;
  roomId?: string;
  token?: string;
  displayName?: string;
}

// Shared by both join actions below — resolves the meeting's VideoSDK
// room, creating one lazily (and marking the meeting "live") the first
// time anyone actually joins a scheduled meeting; an instant meeting
// already has one from the moment it was started.
async function resolveMeetingRoom(meetingId: string): Promise<{ roomId: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: meeting } = await admin.from("kmeet_meetings").select("id, room_id, status").eq("id", meetingId).maybeSingle();

  if (!meeting) return { error: "That meeting could not be found." };
  if (meeting.status === "ended") return { error: "This meeting has already ended." };

  let roomId = meeting.room_id;
  if (!roomId) {
    try {
      roomId = await createVideoSdkRoom();
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't start the meeting." };
    }
    await admin.from("kmeet_meetings").update({ room_id: roomId, status: "live" }).eq("id", meetingId);
  } else if (meeting.status === "scheduled") {
    await admin.from("kmeet_meetings").update({ status: "live" }).eq("id", meetingId);
  }

  return { roomId };
}

// Called from the call page right before mounting the VideoSDK call UI.
export async function joinMeetingAction(meetingId: string): Promise<JoinMeetingResult> {
  const user = await requireUser();
  const [membership, profile] = await Promise.all([requireOrganization(), getProfile()]);
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "read");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) return { error: "That meeting could not be found." };

  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return { error: resolved.error };

  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : (user.email ?? "Guest");

  return { roomId: resolved.roomId, token: generateParticipantToken(resolved.roomId), displayName };
}

// No session required — this is what the public /kmeet/[meetingId] page
// calls after someone types in their name, so anyone with the link can
// join (not just logged-in org members). The meeting itself still has to
// exist and not have ended; there's no further access control beyond
// that, same as every other invite-link-based feature in this app
// (/join/[slug], /events/register/[token], /give/[token]).
export async function joinMeetingAsGuestAction(meetingId: string, guestName: string): Promise<JoinMeetingResult> {
  const trimmedName = guestName.trim().slice(0, 80);
  if (!trimmedName) return { error: "Enter your name to join." };

  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return { error: resolved.error };

  return { roomId: resolved.roomId, token: generateParticipantToken(resolved.roomId), displayName: trimmedName };
}

export async function endMeetingAction(meetingId: string): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "write");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase
    .from("kmeet_meetings")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", meetingId);

  revalidatePath(KMEET_PATH);
}

export async function cancelMeetingAction(meetingId: string): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "delete");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase.from("kmeet_meetings").delete().eq("organization_id", organizationId).eq("id", meetingId);

  revalidatePath(KMEET_PATH);
}
