import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getOrgAdminEmails } from "@/lib/organizations/admin-emails";
import { gstBreakdown, formatRupees, GST_RATE } from "@/lib/billing/gst";
import { documentFromInvoice, type InvoiceDocument } from "@/lib/invoices/document";
import { financialYear, formatInvoiceNumber } from "@/lib/invoices/numbers";
import { renderInvoicePdf, type InvoiceLogo } from "@/lib/invoices/pdf";
import { loadInvoiceTemplate } from "@/lib/invoices/template-store";
import { templateProblems } from "@/lib/invoices/template";
import type { PlatformInvoice, PlatformInvoiceKind } from "@/types/database";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The church's saved billing details, or, for a payment made before they were collected
// (an older subscription), its name and an admin's email, with the state unknown.
async function buyerFor(organizationId: string): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data: details } = await admin.from("organization_billing_details").select("*").eq("organization_id", organizationId).maybeSingle();
  if (details) {
    return { legalName: details.legal_name, gstin: details.gstin ?? "", addressLine1: details.address_line1, addressLine2: details.address_line2 ?? "", city: details.city, state: details.state, pincode: details.pincode, email: details.email, phone: details.phone ?? "" };
  }
  const [{ data: org }, emails] = await Promise.all([admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(), getOrgAdminEmails(organizationId)]);
  await logPlatformEvent({ level: "warning", source: "subscription_billing", message: "An invoice was issued without billing details on file", organizationId });
  return { legalName: org?.name ?? "Customer", gstin: "", addressLine1: "", addressLine2: "", city: "", state: "", pincode: "", email: emails[0] ?? "", phone: "" };
}

// Issues the tax invoice for one payment, once: a second call for the same payment returns the
// invoice already made. The seller and layout are copied in from the template as it is now.
export async function issueInvoice(input: {
  organizationId: string;
  kind: PlatformInvoiceKind;
  // The payment's transaction id.
  reference: string;
  description: string;
  // The price before GST.
  baseAmount: number;
  issuedAt?: Date;
}): Promise<{ invoice: PlatformInvoice } | { error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("platform_invoices").select("*").eq("kind", input.kind).eq("reference", input.reference).maybeSingle();
  if (existing) return { invoice: existing as PlatformInvoice };

  const template = await loadInvoiceTemplate();
  const problems = templateProblems(template);
  if (problems.length > 0) {
    // The payment has already happened, so the invoice is still issued; Super Admin is told what to fix.
    await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Invoice template is missing ${problems.join(", ")}. Fix it under Super Admin → Invoice template.`, organizationId: input.organizationId });
  }

  const buyer = await buyerFor(input.organizationId);
  const tax = gstBreakdown(input.baseAmount, String(buyer.state ?? ""), template.state);
  const issuedAt = input.issuedAt ?? new Date();
  const fy = financialYear(issuedAt);
  const { data: sequence, error: sequenceError } = await admin.rpc("next_invoice_number", { p_fy: fy });
  if (sequenceError || typeof sequence !== "number") return { error: "Couldn't number the invoice." };

  const row = {
    organization_id: input.organizationId,
    invoice_number: formatInvoiceNumber(template.prefix, fy, sequence),
    kind: input.kind,
    reference: input.reference,
    issued_at: issuedAt.toISOString(),
    buyer,
    seller: { name: template.companyName, addressLine1: template.addressLine1, addressLine2: template.addressLine2, city: template.city, state: template.state, pincode: template.pincode, gstin: template.gstin, pan: template.pan, email: template.email, phone: template.phone, website: template.website },
    template: template as unknown as Record<string, unknown>,
    line_items: [{ description: input.description, hsn: template.sacCode, quantity: 1, unitPrice: tax.base, amount: tax.base }],
    subtotal: tax.base,
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    total: tax.total,
    gst_rate: GST_RATE,
    place_of_supply: String(buyer.state ?? "") || template.state,
  };
  const { data: inserted, error } = await admin.from("platform_invoices").insert(row).select("*").single();
  if (error || !inserted) {
    // Another call for the same payment may have just made it.
    const { data: raced } = await admin.from("platform_invoices").select("*").eq("kind", input.kind).eq("reference", input.reference).maybeSingle();
    if (raced) return { invoice: raced as PlatformInvoice };
    return { error: "Couldn't save the invoice." };
  }
  return { invoice: inserted as PlatformInvoice };
}

async function fetchLogo(url: string | null): Promise<InvoiceLogo | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const format = /png/i.test(type) ? "PNG" : /jpe?g/i.test(type) ? "JPEG" : null;
    if (!format) return null;
    return { dataUrl: `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`, format };
  } catch {
    return null;
  }
}

export async function invoicePdf(invoice: PlatformInvoice | InvoiceDocument): Promise<Buffer> {
  const doc = "invoice_number" in invoice ? documentFromInvoice(invoice) : invoice;
  return renderInvoicePdf(doc, await fetchLogo(doc.template.logoUrl));
}

export const invoiceFileName = (invoiceNumber: string) => `Invoice-${invoiceNumber.replace(/\//g, "-")}.pdf`;

// Emails the invoice, with the PDF attached, to the billing email on it. Records whether it
// went, so a failure can be seen (and sent again) from Super Admin.
export async function emailInvoice(invoice: PlatformInvoice): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const doc = documentFromInvoice(invoice);
  const to = doc.buyer.email;
  const record = async (error: string | null) => {
    await admin.from("platform_invoices").update({ email_sent_at: error ? null : new Date().toISOString(), email_error: error }).eq("id", invoice.id);
  };
  if (!to) {
    await record("No billing email on file.");
    return { ok: false, error: "No billing email on file." };
  }
  if (!isEmailConfigured()) {
    await record("Email isn't configured.");
    return { ok: false, error: "Email isn't configured." };
  }
  try {
    const pdf = await invoicePdf(invoice);
    const result = await sendBulkEmail({
      fromName: `${doc.seller.name} Billing`,
      subject: `Tax invoice ${doc.invoiceNumber} from ${doc.seller.name}`,
      html: `<p>Dear ${escapeHtml(doc.buyer.name)},</p><p>Thank you for your payment. Your tax invoice <strong>${escapeHtml(doc.invoiceNumber)}</strong> for <strong>${formatRupees(doc.total)}</strong> (including GST) is attached as a PDF.</p><p>${doc.lineItems.map((i) => escapeHtml(i.description)).join("<br>")}</p><p style="color:#666;font-size:12px">${escapeHtml(doc.template.footer)}</p>`,
      recipients: [to],
      replyTo: doc.seller.email || undefined,
      attachments: [{ filename: invoiceFileName(doc.invoiceNumber), content: pdf, contentType: "application/pdf" }],
      organizationId: invoice.organization_id,
    });
    if (result.sentCount === 0) {
      const message = result.failed[0]?.error ?? "The email wasn't sent.";
      await record(message);
      return { ok: false, error: message };
    }
    await record(null);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The email wasn't sent.";
    await record(message);
    return { ok: false, error: message };
  }
}

// What the payment paths call: make the invoice and email it. Never throws, so a problem with
// an invoice can't undo or fail the payment it is for.
export async function issueAndEmailInvoice(input: Parameters<typeof issueInvoice>[0]): Promise<string | null> {
  try {
    const issued = await issueInvoice(input);
    if ("error" in issued) {
      await logPlatformEvent({ level: "error", source: "platform_admin", message: `Invoice not issued: ${issued.error}`, organizationId: input.organizationId, metadata: { reference: input.reference } });
      return null;
    }
    if (!issued.invoice.email_sent_at) await emailInvoice(issued.invoice);
    return issued.invoice.id;
  } catch (err) {
    await logPlatformEvent({ level: "error", source: "platform_admin", message: `Invoice failed: ${err instanceof Error ? err.message : "unknown error"}`, organizationId: input.organizationId, metadata: { reference: input.reference } });
    return null;
  }
}
