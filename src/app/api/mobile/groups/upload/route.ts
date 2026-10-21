import { actorOrAnswer, json, readJson } from "@/lib/group-chat/mobile";
import { uploadSlot } from "@/lib/group-chat/service";

export const dynamic = "force-dynamic";

// Step one of sending a file: the app says which group and what file (name and size); the server checks the type
// and size and gives a one-time upload link for a path inside the sender's own folder. The file then goes straight
// to storage and the message that follows names that path.
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body) return json({ ok: false, error: "Invalid request." }, 400);
    const found = await actorOrAnswer(request, body.groupId);
    if ("answer" in found) return found.answer;
    const name = typeof body.name === "string" ? body.name : "";
    const size = typeof body.size === "number" ? body.size : 0;
    const result = await uploadSlot(found.actor, body.groupId as string, {
      name,
      size,
    });
    return result.ok
      ? json({
          ok: true,
          path: result.path,
          token: result.token,
          kind: result.kind,
        })
      : json({ ok: false, error: result.error });
  } catch (err) {
    console.error("mobile/groups/upload failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
