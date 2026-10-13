import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStreamMember } from "@/lib/livestream/mobile";

// A member's message in the live chat.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireStreamMember(request);
  if (member instanceof NextResponse) return member;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 300) : "";
  if (!text) return NextResponse.json({ ok: false, error: "Write a message first." }, { status: 400 });

  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("status, chat_enabled").eq("id", id).eq("organization_id", member.organizationId).maybeSingle();
  if (!stream) return NextResponse.json({ ok: false, error: "That live stream could not be found." }, { status: 404 });
  if (!stream.chat_enabled || stream.status !== "live") return NextResponse.json({ ok: false, error: "Chat is closed." }, { status: 409 });

  // A little brake against flooding: a few messages every few seconds.
  const since = new Date(Date.now() - 10_000).toISOString();
  const { count } = await admin.from("live_stream_messages").select("id", { count: "exact", head: true }).eq("stream_id", id).eq("author_name", member.name).eq("author_kind", "member").gt("created_at", since);
  if ((count ?? 0) >= 5) return NextResponse.json({ ok: false, error: "Slow down a little." }, { status: 429 });

  await admin.from("live_stream_messages").insert({ stream_id: id, organization_id: member.organizationId, author_name: member.name, author_kind: "member", body: text });
  return NextResponse.json({ ok: true });
}
