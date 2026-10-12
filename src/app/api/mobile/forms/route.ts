import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  createFormForMobile,
  deleteFormForMobile,
  deleteResponseForMobile,
  setFormStatusForMobile,
  updateFormForMobile,
  type FormsResult,
} from "@/lib/forms/mobile-service";

// The staff mobile app's Forms: create, edit the fields, publish or close, and
// delete forms and responses, with the same permissions and rules as the web.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const organizationId = text("organizationId");
  const action = text("action");
  const id = text("id");

  const level = action === "delete" || action === "delete_response" ? "delete" : "write";
  const auth = await requireMobileTabAccess(request, organizationId, "forms", level);
  if (auth instanceof NextResponse) return auth;

  let result: FormsResult = { ok: false, error: "Invalid request." };
  if (action === "create") {
    result = await createFormForMobile(organizationId, auth.userId, text("title"), text("description"));
  } else if (id) {
    if (action === "update") result = await updateFormForMobile(organizationId, id, text("title"), text("description"), body.fields);
    else if (action === "status") result = await setFormStatusForMobile(organizationId, id, text("status"));
    else if (action === "delete") result = await deleteFormForMobile(organizationId, id);
    else if (action === "delete_response") result = await deleteResponseForMobile(organizationId, id);
  }
  return NextResponse.json(result.ok ? { ok: true, id: result.id, warning: result.warning } : { ok: false, error: result.error });
}
