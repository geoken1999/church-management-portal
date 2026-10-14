import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { sampleDocument } from "@/lib/invoices/document";
import { invoicePdf } from "@/lib/invoices/issue";
import { loadInvoiceTemplate } from "@/lib/invoices/template-store";

// A sample invoice as a PDF, made from the saved template.
export async function GET() {
  await requirePlatformAdmin();
  const pdf = await invoicePdf(sampleDocument(await loadInvoiceTemplate()));
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="sample-invoice.pdf"' } });
}
