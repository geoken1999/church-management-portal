import { authUserIdFromRequest, json } from "@/lib/group-chat/mobile";
import { myFamilies } from "@/lib/families/requests";

export const dynamic = "force-dynamic";

// The signed-in member's families and their latest family request.
export async function POST(request: Request) {
  const userId = await authUserIdFromRequest(request);
  if (!userId) return json({ ok: false, error: "That session could not be verified." }, 401);
  return json(await myFamilies(userId));
}
