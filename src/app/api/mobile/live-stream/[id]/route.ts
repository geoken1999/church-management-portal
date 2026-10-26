import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicStream, requireStreamMember } from "@/lib/livestream/mobile";
import { reportViewer } from "@/lib/livestream/service";
import { viewerSlide } from "@/lib/projection/service";
import type { LiveStream } from "@/types/database";

// Polled every few seconds while a member watches: counts them as a viewer and
// returns the stream's state, how many are watching, and the chat since `after`.
// Kept light because every viewer calls it constantly: the reads run side by side and
// the viewer's own report is saved after the reply has been sent.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await requireStreamMember(request);
  if (member instanceof NextResponse) return member;
  const { id } = await params;

  const admin = createAdminClient();
  const q = new URL(request.url).searchParams;
  const num = (key: string) => {
    const value = Number(q.get(key));
    return q.get(key) !== null && Number.isFinite(value) ? value : null;
  };
  const after_ = q.get("after");

  const messagesQuery = () => {
    let query = admin
      .from("live_stream_messages")
      .select("id, author_name, author_kind, body, created_at")
      .eq("stream_id", id);
    query =
      after_ && !Number.isNaN(Date.parse(after_))
        ? query
            .gt("created_at", after_)
            .order("created_at", { ascending: true })
            .limit(100)
        : query.order("created_at", { ascending: false }).limit(50);
    return query;
  };

  const { data } = await admin
    .from("live_streams")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organizationId)
    .maybeSingle();
  if (!data)
    return NextResponse.json(
      { ok: false, error: "That live stream could not be found." },
      { status: 404 },
    );
  const stream = data as LiveStream;

  const metrics = {
    rttMs: num("rtt"),
    bufferedMs: num("buf"),
    stalls: num("stalls"),
    buffering: q.get("buffering") === "1",
    resolution: q.get("res"),
  };
  const [report, chat, projected] = await Promise.all([
    stream.status === "live"
      ? reportViewer(id, member.authUserId, metrics, stream.peak_viewers)
      : Promise.resolve(null),
    stream.chat_enabled ? messagesQuery() : Promise.resolve(null),
    // The verse or song words on the church's projector, shown under the video while the stream is live.
    stream.status === "live" ? viewerSlide(member.organizationId) : Promise.resolve(null),
  ]);
  if (report) after(report.save);

  const rows = chat?.data ?? [];
  const list = after_ ? rows : rows.slice().reverse();
  const messages = list.map((m) => ({
    id: m.id,
    name: m.author_name,
    host: m.author_kind === "host",
    body: m.body,
    at: m.created_at,
  }));

  return NextResponse.json({
    ok: true,
    stream: publicStream(stream),
    viewers: report?.count ?? 0,
    messages,
    projection: projected ? { title: projected.slide.title, text: projected.slide.text, footer: projected.slide.footer, kind: projected.slide.kind, image: projected.slide.image ?? null, at: projected.updatedAt } : null,
  });
}
