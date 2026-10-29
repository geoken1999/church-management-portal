import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  checkAiCreditQuota,
  getPlanUsage,
  recordAiReplyUsage,
} from "@/lib/plans/dal";
import { runAuraQuery } from "@/lib/aura/engine";
import {
  getAiDataAccessRules,
  type AiDataAccessRules,
} from "@/lib/ai-rules/dal";
import { COLUMN_BY_KEY } from "@/lib/ai-rules/columns";
import type { ToolMessage } from "@/lib/ai/openai";
import type { Database } from "@/types/database";

// The staff mobile app's AI Tools: chat with Aura (your own conversation, one
// credit per message) and the AI Rules switches. The same tabs, credits and rules
// as the web.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const view = url.searchParams.get("view");

  if (view === "rules") {
    const auth = await requireMobileTabAccess(
      request,
      organizationId,
      "airules",
      "read",
    );
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json({
      ok: true,
      rules: await getAiDataAccessRules(organizationId),
    });
  }

  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "aitools",
    "read",
  );
  if (auth instanceof NextResponse) return auth;
  const admin = createAdminClient();
  const [{ data: messages }, usage] = await Promise.all([
    admin
      .from("aura_messages")
      .select("id, role, content, created_at")
      .eq("organization_id", organizationId)
      .eq("auth_user_id", auth.userId)
      .order("created_at", { ascending: true })
      .limit(200),
    getPlanUsage(organizationId),
  ]);
  return NextResponse.json({
    ok: true,
    messages: messages ?? [],
    remaining: usage.aiRepliesRemaining,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  const action = body.action;

  if (action === "rule") {
    const auth = await requireMobileTabAccess(
      request,
      organizationId,
      "airules",
      "write",
    );
    if (auth instanceof NextResponse) return auth;
    const key = body.key as keyof AiDataAccessRules;
    if (
      typeof key !== "string" ||
      !Object.prototype.hasOwnProperty.call(COLUMN_BY_KEY, key) ||
      typeof body.value !== "boolean"
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid request." },
        { status: 400 },
      );
    }
    const update = {
      organization_id: organizationId,
      [COLUMN_BY_KEY[key]]: body.value,
      updated_by: auth.userId,
    } as Database["public"]["Tables"]["ai_data_access_rules"]["Insert"];
    const { error } = await createAdminClient()
      .from("ai_data_access_rules")
      .upsert(update, { onConflict: "organization_id" });
    return NextResponse.json(
      error
        ? { ok: false, error: "Couldn't save that setting. Please try again." }
        : { ok: true },
    );
  }

  if (action !== "aura_message")
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "aitools",
    "write",
  );
  if (auth instanceof NextResponse) return auth;

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content)
    return NextResponse.json({
      ok: false,
      error: "Type a question for Aura first.",
    });
  if (content.length > 2000)
    return NextResponse.json({
      ok: false,
      error: "Keep the question under 2,000 characters.",
    });

  const quotaError = await checkAiCreditQuota(organizationId);
  if (quotaError) return NextResponse.json({ ok: false, error: quotaError });

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("aura_messages")
    .select("role, content")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", auth.userId)
    .order("created_at", { ascending: true })
    .limit(200);
  const history: ToolMessage[] = (prior ?? [])
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
  history.push({ role: "user", content });

  const { error: insertError } = await admin
    .from("aura_messages")
    .insert({
      organization_id: organizationId,
      auth_user_id: auth.userId,
      role: "user",
      content,
    });
  if (insertError)
    return NextResponse.json({
      ok: false,
      error: "Couldn't save your message. Please try again.",
    });

  let reply: string;
  try {
    const canWrite = async (tab: "events" | "todos" | "planner") =>
      !((await requireMobileTabAccess(request, organizationId, tab, "write")) instanceof NextResponse);
    const actor = {
      userId: auth.userId,
      canWrite: { events: await canWrite("events"), todos: await canWrite("todos"), planner: await canWrite("planner") },
    };
    reply = await runAuraQuery(organizationId, history, actor);
  } catch (err) {
    console.error("Ask Aura (mobile) query failed:", err);
    return NextResponse.json({
      ok: false,
      error:
        "Aura couldn't answer that just now. Please try again in a moment.",
    });
  }

  await admin
    .from("aura_messages")
    .insert({
      organization_id: organizationId,
      auth_user_id: auth.userId,
      role: "assistant",
      content: reply,
    });
  await recordAiReplyUsage(organizationId, "ask_aura");
  const usage = await getPlanUsage(organizationId);
  return NextResponse.json({
    ok: true,
    reply,
    remaining: usage.aiRepliesRemaining,
  });
}
