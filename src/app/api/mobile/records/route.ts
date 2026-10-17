import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { MODULES, isModuleKey } from "@/lib/mobile/modules";
import {
  createRecord,
  deleteRecord,
  updateRecord,
} from "@/lib/mobile/modules-service";

// The staff mobile app's simple modules (ministries, worship and media teams,
// offerings, donations, fundraisers): add, edit and remove, with the same
// permissions, plan checks and rules as the web pages.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const moduleKey = text("module");
  const action = text("action");
  const id = text("id");
  const organizationId = text("organizationId");

  if (
    !isModuleKey(moduleKey) ||
    !["create", "update", "delete"].includes(action)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  if (action !== "create" && !id)
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const spec = MODULES[moduleKey];
  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    spec.tab,
    action === "delete" ? "delete" : "write",
  );
  if (auth instanceof NextResponse) return auth;

  const fields = (
    body.fields && typeof body.fields === "object" ? body.fields : {}
  ) as Record<string, unknown>;
  const result =
    action === "create"
      ? await createRecord(spec, organizationId, auth.userId, fields)
      : action === "update"
        ? await updateRecord(spec, organizationId, id, fields)
        : await deleteRecord(spec, organizationId, id);

  return NextResponse.json(
    result.ok ? { ok: true } : { ok: false, error: result.error },
  );
}
