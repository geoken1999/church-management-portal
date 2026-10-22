import { createAdminClient } from "@/lib/supabase/admin";
import { authUserIdFromRequest, isUuid, json, readJson } from "@/lib/group-chat/mobile";
import { reviewFamilyRequest } from "@/lib/families/requests";

export const dynamic = "force-dynamic";

// The team app: an owner or admin approves or rejects a member's family request.
export async function POST(request: Request) {
  const userId = await authUserIdFromRequest(request);
  if (!userId) return json({ ok: false, error: "That session could not be verified." }, 401);
  const body = await readJson(request);
  const requestId = body?.requestId;
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  if (!isUuid(requestId) || !decision) return json({ ok: false, error: "Invalid request." }, 400);

  const admin = createAdminClient();
  const { data: target } = await admin.from("family_requests").select("organization_id").eq("id", requestId).maybeSingle();
  if (!target) return json({ ok: false, error: "That request could not be found." }, 404);
  const { data: staff } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", target.organization_id)
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!staff || (staff.role !== "owner" && staff.role !== "admin"))
    return json({ ok: false, error: "Only an owner or admin can review this." }, 403);

  return json(
    await reviewFamilyRequest({
      requestId,
      organizationId: target.organization_id,
      reviewerId: userId,
      decision,
      note: typeof body?.note === "string" ? body.note : undefined,
    }),
  );
}
