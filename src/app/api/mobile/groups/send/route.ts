import { actorOrAnswer, isUuid, json, readJson } from "@/lib/group-chat/mobile";
import { sendMessage } from "@/lib/group-chat/service";

export const dynamic = "force-dynamic";

// A message from the app: text and/or a file that was uploaded first (see ../upload), optionally a reply, a
// list of @mentioned logins, or an announcement (group admins only; the service checks).
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const found = await actorOrAnswer(request, body.groupId);
    if ("answer" in found) return found.answer;
    const a = body.attachment as
      { path?: unknown; name?: unknown; size?: unknown } | null | undefined;
    const attachment =
      a &&
      typeof a.path === "string" &&
      typeof a.name === "string" &&
      typeof a.size === "number"
        ? { path: a.path, name: a.name, size: Math.round(a.size) }
        : null;
    const result = await sendMessage(found.actor, {
      groupId: body.groupId as string,
      body: typeof body.body === "string" ? body.body : "",
      replyTo: isUuid(body.replyTo) ? body.replyTo : null,
      announcement: body.announcement === true,
      mentions: Array.isArray(body.mentions)
        ? body.mentions.filter(isUuid)
        : [],
      attachment,
    });
    return result.ok
      ? json({ ok: true, id: result.message.id })
      : json({ ok: false, error: result.error });
  } catch (err) {
    console.error("mobile/groups/send failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
