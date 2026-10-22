import { authUserIdFromRequest, json, readJson } from "@/lib/group-chat/mobile";
import { searchMembersForFamily } from "@/lib/families/requests";

export const dynamic = "force-dynamic";

// Finds other members of the caller's church to put in a family (name or number, 3+ characters).
export async function POST(request: Request) {
  const userId = await authUserIdFromRequest(request);
  if (!userId) return json({ ok: false, error: "That session could not be verified." }, 401);
  const body = await readJson(request);
  const query = typeof body?.query === "string" ? body.query : "";
  return json(await searchMembersForFamily(userId, query));
}
