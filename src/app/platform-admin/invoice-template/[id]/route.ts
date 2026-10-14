import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoiceFileName, invoicePdf } from "@/lib/invoices/issue";
import type { PlatformInvoice } from "@/types/database";

// Any issued invoice as a PDF, for Super Admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await createAdminClient().from("platform_invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invoice = data as PlatformInvoice;
  return new NextResponse(new Uint8Array(await invoicePdf(invoice)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoiceFileName(invoice.invoice_number)}"` } });
}
