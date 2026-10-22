import { authUserIdFromRequest, json, readJson } from "@/lib/group-chat/mobile";
import { submitFamilyRequest } from "@/lib/families/requests";

export const dynamic = "force-dynamic";

// A member asks for a family to be created; an owner or admin approves it.
export async function POST(request: Request) {
  const userId = await authUserIdFromRequest(request);
  if (!userId) return json({ ok: false, error: "That session could not be verified." }, 401);
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "Invalid request." }, 400);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const people = Array.isArray(body.people)
    ? body.people.map((p) => ({
        memberId: str((p as Record<string, unknown>)?.memberId),
        relationship: str((p as Record<string, unknown>)?.relationship),
      }))
    : [];
  return json(
    await submitFamilyRequest(userId, {
      name: str(body.name),
      notes: str(body.notes),
      requesterRelationship: str(body.requesterRelationship),
      people,
    }),
  );
}
