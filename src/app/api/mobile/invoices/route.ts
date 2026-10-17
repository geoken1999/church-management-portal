import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  createInvoiceForMobile,
  deleteInvoiceForMobile,
  setInvoiceStatusForMobile,
  type InvoiceResult,
} from "@/lib/accounting/mobile-invoices";

// The staff mobile app's invoices: create, mark paid / unpaid / cancelled, delete.
// The Accounting tab's permissions and the web's rules apply.
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
    "accounting",
    action === "delete" ? "delete" : "write",
  );
  if (auth instanceof NextResponse) return auth;

  let result: InvoiceResult = { ok: false, error: "Invalid request." };
  if (action === "create")
    result = await createInvoiceForMobile(
      organizationId,
      auth.userId,
      (body.fields ?? {}) as Record<string, unknown>,
    );
  else if (id && action === "status")
    result = await setInvoiceStatusForMobile(
      organizationId,
      id,
      text("status"),
    );
  else if (id && action === "delete")
    result = await deleteInvoiceForMobile(organizationId, id);
  return NextResponse.json(
    result.ok
      ? { ok: true, id: result.id }
      : { ok: false, error: result.error },
  );
}
