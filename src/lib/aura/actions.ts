"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkAiCreditQuota, recordAiReplyUsage } from "@/lib/plans/dal";
import { createClient } from "@/lib/supabase/server";
import { getAuraMessages } from "@/lib/aura/dal";
import { runAuraQuery } from "@/lib/aura/engine";
import type { ToolMessage } from "@/lib/ai/openai";

const ASK_AURA_PATH = "/dashboard/ask-aura";

export interface SendAuraMessageResult {
  error?: string;
  reply?: string;
}

// One credit per user message (not per OpenAI call the tool loop makes
// internally) — matches "each chat costs 1 credit" exactly as specified,
// rather than charging per tool round-trip.
export async function sendAuraMessage(content: string): Promise<SendAuraMessageResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "aitools", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { error: "Type a question for Aura first." };
  }

  const quotaError = await checkAiCreditQuota(organizationId);
  if (quotaError) {
    return { error: quotaError };
  }

  const supabase = await createClient();

  const priorMessages = await getAuraMessages(organizationId, user.id);
  const history: ToolMessage[] = priorMessages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  history.push({ role: "user", content: trimmed });

  const { error: insertUserError } = await supabase
    .from("aura_messages")
    .insert({ organization_id: organizationId, auth_user_id: user.id, role: "user", content: trimmed });
  if (insertUserError) {
    return { error: "Couldn't save your message. Please try again." };
  }

  let reply: string;
  try {
    reply = await runAuraQuery(organizationId, history);
  } catch (err) {
    console.error("Ask Aura query failed:", err);
    return { error: "Aura couldn't answer that just now. Please try again in a moment." };
  }

  await supabase.from("aura_messages").insert({ organization_id: organizationId, auth_user_id: user.id, role: "assistant", content: reply });
  await recordAiReplyUsage(organizationId, "ask_aura");

  revalidatePath(ASK_AURA_PATH);
  return { reply };
}
