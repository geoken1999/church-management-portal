import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoiceFileName, invoicePdf } from "@/lib/invoices/issue";
import type { PlatformInvoice } from "@/types/database";

// Downloads one of the church's KingdomFlow invoices as a PDF. Owners and admins only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await createAdminClient().from("platform_invoices").select("*").eq("id", id).eq("organization_id", membership.organization.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invoice = data as PlatformInvoice;
  return new NextResponse(new Uint8Array(await invoicePdf(invoice)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoiceFileName(invoice.invoice_number)}"` },
  });
}
