import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicStream, requireStreamMember } from "@/lib/livestream/mobile";
import { reportViewer } from "@/lib/livestream/service";
import type { LiveStream } from "@/types/database";

// Polled every few seconds while a member watches: counts them as a viewer and
// returns the stream's state, how many are watching, and the chat since `after`.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireStreamMember(request);
  if (member instanceof NextResponse) return member;
  const { id } = await params;

  const admin = createAdminClient();
  const { data } = await admin.from("live_streams").select("*").eq("id", id).eq("organization_id", member.organizationId).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "That live stream could not be found." }, { status: 404 });
  const stream = data as LiveStream;

  // How the viewer's playback is going, as reported by the app.
  const q = new URL(request.url).searchParams;
  const num = (key: string) => {
    const value = Number(q.get(key));
    return q.get(key) !== null && Number.isFinite(value) ? value : null;
  };
  const viewers =
    stream.status === "live"
      ? await reportViewer(id, member.authUserId, { rttMs: num("rtt"), bufferedMs: num("buf"), stalls: num("stalls"), buffering: q.get("buffering") === "1", resolution: q.get("res") })
      : 0;

  const after = new URL(request.url).searchParams.get("after");
  let messages: { id: string; name: string; host: boolean; body: string; at: string }[] = [];
  if (stream.chat_enabled) {
    let query = admin.from("live_stream_messages").select("id, author_name, author_kind, body, created_at").eq("stream_id", id);
    query = after && !Number.isNaN(Date.parse(after)) ? query.gt("created_at", after).order("created_at", { ascending: true }).limit(100) : query.order("created_at", { ascending: false }).limit(50);
    const { data: rows } = await query;
    const list = after ? (rows ?? []) : (rows ?? []).slice().reverse();
    messages = list.map((m) => ({ id: m.id, name: m.author_name, host: m.author_kind === "host", body: m.body, at: m.created_at }));
  }

  return NextResponse.json({ ok: true, stream: publicStream(stream), viewers, messages });
}
