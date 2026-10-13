import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamForIngest } from "@/lib/livestream/whip";
import { whipEnd } from "@/lib/livestream/videosdk";

// OBS says it has stopped: the encoder is no longer sending.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await streamForIngest(request, id);
  if ("error" in found) return new NextResponse(found.error, { status: found.status });

  if (found.stream.ingest_session) await whipEnd(found.stream.ingest_session);
  await createAdminClient().from("live_streams").update({ ingest_active: false, ingest_session: null }).eq("id", id);
  return new NextResponse(null, { status: 200 });
}

// Trickle ICE updates from the encoder need no action here.
export function PATCH() {
  return new NextResponse(null, { status: 204 });
}
