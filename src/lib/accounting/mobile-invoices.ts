import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinancePlan } from "@/lib/finance/actions";
import { validateInvoice, type InvoiceLineItemInput } from "@/lib/accounting/validation";
import type { InvoiceStatus } from "@/types/database";

// The staff mobile app's invoice changes: the same rules as the web's server
// actions (src/lib/accounting/actions.ts). Who may do it was checked by the route.

export type InvoiceResult = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): InvoiceResult => ({ ok: false, error });

// The next invoice number (INV-0001, INV-0002...), counted with the service role
// so it needs no browser session.
async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const admin = createAdminClient();
  const { count } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  return `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createInvoiceForMobile(organizationId: string, userId: string, f: Record<string, unknown>): Promise<InvoiceResult> {
  const planError = await requireFinancePlan(organizationId);
  if (planError) return fail(planError);

  const text = (key: string) => (typeof f[key] === "string" ? (f[key] as string).trim() : "");
  const billToName = text("billToName");
  const issueDate = text("issueDate");
  const taxRate = text("taxRate") || "0";
  const branchId = text("branchId");
  const items: InvoiceLineItemInput[] = Array.isArray(f.items)
    ? (f.items as Record<string, unknown>[]).map((item) => ({ description: String(item.description ?? ""), quantity: String(item.quantity ?? ""), unitPrice: String(item.unitPrice ?? "") }))
    : [];

  const errors = validateInvoice({ billToName, issueDate, taxRate, items });
  const firstError = errors.billToName ?? errors.issueDate ?? errors.taxRate ?? errors.items;
  if (firstError) return fail(firstError);

  const admin = createAdminClient();
  if (branchId) {
    const { data: branch } = await admin.from("branches").select("id").eq("id", branchId).eq("organization_id", organizationId).maybeSingle();
    if (!branch) return fail("That branch could not be found.");
  }

  const validItems = items.filter((item) => item.description.trim());
  const subtotal = validItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  const taxRateNumber = Number(taxRate) || 0;
  const taxAmount = subtotal * (taxRateNumber / 100);
  const total = subtotal + taxAmount;

  let invoiceId: string | null = null;
  for (let attempt = 0; attempt < 3 && !invoiceId; attempt++) {
    const { data, error } = await admin
      .from("invoices")
      .insert({
        organization_id: organizationId,
        invoice_number: await nextInvoiceNumber(organizationId),
        branch_id: branchId || null,
        bill_to_name: billToName,
        bill_to_email: text("billToEmail") || null,
        bill_to_address: text("billToAddress") || null,
        issue_date: issueDate,
        due_date: text("dueDate") || null,
        notes: text("notes") || null,
        subtotal,
        tax_rate: taxRateNumber,
        tax_amount: taxAmount,
        total,
        created_by: userId,
      })
      .select("id")
      .single();
    if (data) invoiceId = data.id;
    else if (error?.code !== "23505") return fail("Couldn't create that invoice. Please try again.");
  }
  if (!invoiceId) return fail("Couldn't create that invoice. Please try again.");

  const { error: itemsError } = await admin.from("invoice_items").insert(
    validItems.map((item, index) => ({
      invoice_id: invoiceId,
      organization_id: organizationId,
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      amount: Number(item.quantity) * Number(item.unitPrice),
      sort_order: index,
    })),
  );
  if (itemsError) return fail("Invoice created, but its line items failed to save. Please delete it and try again.");
  return { ok: true, id: invoiceId };
}

export async function setInvoiceStatusForMobile(organizationId: string, id: string, status: string): Promise<InvoiceResult> {
  if (await requireFinancePlan(organizationId)) return fail("Finance isn't included on your plan.");
  if (!["unpaid", "paid", "cancelled"].includes(status)) return fail("Invalid status.");
  const admin = createAdminClient();
  const { error } = await admin.from("invoices").update({ status: status as InvoiceStatus }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't change that. Please try again.") : { ok: true };
}

export async function deleteInvoiceForMobile(organizationId: string, id: string): Promise<InvoiceResult> {
  if (await requireFinancePlan(organizationId)) return fail("Finance isn't included on your plan.");
  const admin = createAdminClient();
  const { error } = await admin.from("invoices").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that invoice.") : { ok: true };
}
