import { createAdminClient } from "@/lib/supabase/admin";
import { actorOrAnswer, isUuid, json } from "@/lib/group-chat/mobile";
import { attachmentLink } from "@/lib/group-chat/service";

export const dynamic = "force-dynamic";

// A short-lived link to a message's picture or file, for someone in the group.
export async function GET(request: Request) {
  try {
    const messageId = new URL(request.url).searchParams.get("messageId");
    if (!isUuid(messageId))
      return json(
        { ok: false, error: "That message could not be found." },
        404,
      );
    const { data: message } = await createAdminClient()
      .from("church_group_messages")
      .select("group_id")
      .eq("id", messageId)
      .maybeSingle();
    const found = await actorOrAnswer(request, message?.group_id);
    if ("answer" in found) return found.answer;
    const result = await attachmentLink(found.actor, messageId);
    return result.ok
      ? json({
          ok: true,
          url: result.url,
          name: result.name,
          kind: result.kind,
        })
      : json({ ok: false, error: result.error });
  } catch (err) {
    console.error("mobile/groups/attachment failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
