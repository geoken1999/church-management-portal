import { describe, expect, it } from "vitest";
import { sampleDocument } from "@/lib/invoices/document";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { DEFAULT_INVOICE_TEMPLATE, normalizeInvoiceTemplate, templateProblems } from "@/lib/invoices/template";

describe("invoice PDF", () => {
  it("produces a real PDF from a sample invoice", () => {
    const template = normalizeInvoiceTemplate({ ...DEFAULT_INVOICE_TEMPLATE, companyName: "KingdomFlow Pvt Ltd", addressLine1: "1 Main Road", city: "Mumbai", pincode: "400001", gstin: "27ABCDE1234F1Z5", showBankDetails: true, bankName: "HDFC", accountNumber: "1234567890", ifsc: "HDFC0000001" });
    const pdf = renderInvoicePdf(sampleDocument(template));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
  it("draws IGST invoices and many lines without failing", () => {
    const doc = sampleDocument(DEFAULT_INVOICE_TEMPLATE);
    doc.igst = 269.82;
    doc.cgst = 0;
    doc.sgst = 0;
    doc.lineItems = Array.from({ length: 30 }, (_, i) => ({ description: `Item ${i + 1}`, hsn: "998314", quantity: 1, unitPrice: 10, amount: 10 }));
    expect(renderInvoicePdf(doc).length).toBeGreaterThan(2000);
  });
});

describe("invoice template", () => {
  it("falls back to defaults and cleans what is saved", () => {
    const t = normalizeInvoiceTemplate({ prefix: "kf-in!", accentColor: "red", gstin: "27abcde1234f1z5", logoUrl: "http://insecure/logo.png" });
    expect(t).toMatchObject({ prefix: "KFIN", accentColor: DEFAULT_INVOICE_TEMPLATE.accentColor, gstin: "27ABCDE1234F1Z5", logoUrl: null });
  });
  it("lists what is missing before invoices can be issued", () => {
    expect(templateProblems(DEFAULT_INVOICE_TEMPLATE)).toEqual(expect.arrayContaining(["the company address", "a valid GSTIN"]));
    const ok = normalizeInvoiceTemplate({ addressLine1: "1 Main Road", city: "Mumbai", pincode: "400001", gstin: "27ABCDE1234F1Z5" });
    expect(templateProblems(ok)).toEqual([]);
  });
});
