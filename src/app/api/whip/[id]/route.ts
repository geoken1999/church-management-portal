import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamForIngest } from "@/lib/livestream/whip";
import { whipOffer } from "@/lib/livestream/videosdk";

// The address OBS (30 or newer: Settings → Stream → Service "WHIP") sends the picture to.
// The stream key is the bearer token. This only trades the WebRTC offer and answer;
// the video itself goes straight from OBS to the video service.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await streamForIngest(request, id);
  if ("error" in found) return new NextResponse(found.error, { status: found.status });

  const offer = await request.text();
  if (!offer.trim()) return new NextResponse("Missing offer.", { status: 400 });

  const result = await whipOffer(found.roomId, `obs-${id.slice(0, 8)}`, offer);
  if ("error" in result) return new NextResponse(result.error, { status: result.status >= 400 && result.status < 500 ? result.status : 502 });

  // An encoder that was already connected is replaced by this one.
  await createAdminClient().from("live_streams").update({ ingest_active: true, ingest_session: result.sessionId }).eq("id", id);
  await createAdminClient().from("kmeet_meetings").update({ last_active_at: new Date().toISOString() }).eq("id", found.stream.meeting_id);

  // The session address must be on the same host OBS just used. OBS does not follow a redirect when it later stops
  // (it sends a DELETE here), so an address on the other of kingdomflow.in / www.kingdomflow.in would never be closed.
  return new NextResponse(result.answer, {
    status: 201,
    headers: { "Content-Type": "application/sdp", Location: `${new URL(request.url).origin}/api/whip/${id}/session` },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: "POST, OPTIONS", "Accept-Post": "application/sdp" } });
}
