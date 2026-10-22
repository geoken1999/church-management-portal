import { authUserIdFromRequest, isUuid, json, readJson } from "@/lib/group-chat/mobile";
import { addToMyFamily, removeFromMyFamily, renameMyFamily } from "@/lib/families/requests";

export const dynamic = "force-dynamic";

// A member managing their family from the app: the person who created it renames it and
// adds or removes people; everyone else in it can only leave.
export async function POST(request: Request) {
  const userId = await authUserIdFromRequest(request);
  if (!userId) return json({ ok: false, error: "That session could not be verified." }, 401);
  const body = await readJson(request);
  const familyId = body?.familyId;
  if (!isUuid(familyId)) return json({ ok: false, error: "That family could not be found." }, 404);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (body?.action) {
    case "update":
      return json(await renameMyFamily(userId, familyId, str(body.name), str(body.notes)));
    case "add":
      return json(await addToMyFamily(userId, familyId, str(body.memberId), str(body.relationship)));
    case "remove":
      return json(await removeFromMyFamily(userId, familyId, str(body.memberId)));
    default:
      return json({ ok: false, error: "Invalid request." }, 400);
  }
}
