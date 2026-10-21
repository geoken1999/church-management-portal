import { createAdminClient } from "@/lib/supabase/admin";
import { actorOrAnswer, isUuid, json, readJson } from "@/lib/group-chat/mobile";
import { deleteMessage } from "@/lib/group-chat/service";

export const dynamic = "force-dynamic";

// Deletes a message: your own, or any in a group you are an admin of (the service checks which).
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body || !isUuid(body.messageId))
      return json(
        { ok: false, error: "That message could not be found." },
        404,
      );
    const { data: message } = await createAdminClient()
      .from("church_group_messages")
      .select("group_id")
      .eq("id", body.messageId)
      .maybeSingle();
    const found = await actorOrAnswer(request, message?.group_id);
    if ("answer" in found) return found.answer;
    const result = await deleteMessage(found.actor, body.messageId);
    return result.ok
      ? json({ ok: true })
      : json({ ok: false, error: result.error });
  } catch (err) {
    console.error("mobile/groups/delete failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
