import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { publicStream, requireStreamMember } from "@/lib/livestream/mobile";
import type { LiveStream } from "@/types/database";

// The member app's live stream card: the church's stream that is live right now, if any.
export async function GET(request: Request) {
  const member = await requireStreamMember(request);
  if (member instanceof NextResponse) return member;

  await endIdleMeetings(member.organizationId);
  const { data } = await createAdminClient()
    .from("live_streams")
    .select("*")
    .eq("organization_id", member.organizationId)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ok: true, stream: data ? publicStream(data as LiveStream) : null });
}
