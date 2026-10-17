import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  createAutomation,
  deleteAutomation,
  deleteTrigger,
  updateAutomation,
  upsertDestination,
  upsertTrigger,
  type AutomationResult,
} from "@/lib/automations/mobile-service";

// The staff mobile app's Automations (birthday and anniversary messages): create,
// activate or pause, delete, and edit triggers and the staff digest, with the
// Automations tab's permissions and the web's rules.
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
  const organizationId = text("organizationId");
  const action = text("action");
  const id = text("id");

  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "automations",
    action === "delete" ? "delete" : "write",
  );
  if (auth instanceof NextResponse) return auth;

  let result: AutomationResult = { ok: false, error: "Invalid request." };
  switch (action) {
    case "create":
      result = await createAutomation(
        organizationId,
        auth.userId,
        text("name"),
      );
      break;
    case "update":
      if (id)
        result = await updateAutomation(organizationId, auth.userId, id, {
          name: typeof body.name === "string" ? body.name : undefined,
          status: typeof body.status === "string" ? body.status : undefined,
        });
      break;
    case "delete":
      if (id) result = await deleteAutomation(organizationId, id);
      break;
    case "trigger_save": {
      const t = (body.trigger ?? {}) as Record<string, unknown>;
      result = await upsertTrigger(organizationId, {
        id: typeof t.id === "string" && t.id ? t.id : undefined,
        automationId: typeof t.automationId === "string" ? t.automationId : "",
        dateFieldSource:
          t.dateFieldSource === "custom_field" ? "custom_field" : "built_in",
        builtInField:
          t.builtInField === "wedding_date"
            ? "wedding_date"
            : t.builtInField === "date_of_birth"
              ? "date_of_birth"
              : null,
        dateFieldId:
          typeof t.dateFieldId === "string" && t.dateFieldId
            ? t.dateFieldId
            : null,
        occasionLabel:
          typeof t.occasionLabel === "string" ? t.occasionLabel : "",
        daysOffset: Number(t.daysOffset ?? 0),
        templateId:
          typeof t.templateId === "string" && t.templateId
            ? t.templateId
            : null,
        variableValues:
          t.variableValues && typeof t.variableValues === "object"
            ? (t.variableValues as Record<string, string>)
            : {},
        isActive: t.isActive !== false,
      });
      break;
    }
    case "trigger_delete":
      if (id) result = await deleteTrigger(organizationId, id);
      break;
    case "destination_save": {
      const d = (body.destination ?? {}) as Record<string, unknown>;
      result = await upsertDestination(organizationId, {
        automationId: typeof d.automationId === "string" ? d.automationId : "",
        kind: d.kind === "direct_member" ? "direct_member" : "staff_digest",
        isActive: d.isActive !== false,
        recipientLeaderIds: Array.isArray(d.recipientLeaderIds)
          ? d.recipientLeaderIds.filter(
              (x): x is string => typeof x === "string",
            )
          : [],
        digestTemplateId:
          typeof d.digestTemplateId === "string" && d.digestTemplateId
            ? d.digestTemplateId
            : null,
      });
      break;
    }
  }
  return NextResponse.json(
    result.ok
      ? { ok: true, id: result.id }
      : { ok: false, error: result.error },
  );
}
