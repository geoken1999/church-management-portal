import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LiveStream } from "@/types/database";

export interface StreamMember {
  authUserId: string;
  organizationId: string;
  name: string;
}

// A viewer's session is checked against Supabase on every poll, which is two extra round trips
// every few seconds for each person watching. A verified session is remembered for a short time
// per server instance, so a sign-out or removed membership takes effect within that time.
const SESSION_TTL_MS = 30_000;
const MAX_CACHED = 2000;
const verified = new Map<string, { at: number; member: StreamMember }>();

// The signed-in member behind a mobile request, or the error response to send back.
export async function requireStreamMember(
  request: Request,
): Promise<StreamMember | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  const cached = verified.get(token);
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.member;

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  const { data: member } = await admin
    .from("members")
    .select("first_name, last_name, organization_id, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member || member.status !== "active")
    return NextResponse.json(
      { ok: false, error: "No active membership." },
      { status: 403 },
    );

  const result = {
    authUserId: userData.user.id,
    organizationId: member.organization_id,
    name: `${member.first_name} ${member.last_name}`.trim() || "Member",
  };
  if (verified.size >= MAX_CACHED) verified.clear();
  verified.set(token, { at: Date.now(), member: result });
  return result;
}

// What a member may see of a stream: never the restream keys.
export function publicStream(s: LiveStream) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    playbackUrl: s.status === "live" ? s.playback_url : null,
    orientation: s.orientation,
    audioOnly: s.audio_only,
    chatEnabled: s.chat_enabled,
    startedAt: s.started_at,
  };
}
