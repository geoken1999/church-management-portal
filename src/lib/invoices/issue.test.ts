import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeInvoiceTemplate } from "@/lib/invoices/template";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform-events/log", () => ({ logPlatformEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/organizations/admin-emails", () => ({ getOrgAdminEmails: async () => ["admin@church.test"] }));
const sendBulkEmail = vi.fn(async () => ({ sentCount: 1, failed: [] as { email: string; error: string }[] }));
vi.mock("@/lib/email/client", () => ({ sendBulkEmail: (...a: unknown[]) => sendBulkEmail(...(a as [])) }));
vi.mock("@/lib/email/env", () => ({ isEmailConfigured: () => true }));

const template = normalizeInvoiceTemplate({ companyName: "KingdomFlow", addressLine1: "1 Main Road", city: "Mumbai", state: "Maharashtra", pincode: "400001", gstin: "27ABCDE1234F1Z5", prefix: "KF" });
vi.mock("@/lib/invoices/template-store", () => ({ loadInvoiceTemplate: async () => template }));

// In-memory stand-in for the tables the issuer touches.
const db: { invoices: Record<string, unknown>[]; details: Record<string, unknown> | null; counter: number } = { invoices: [], details: null, counter: 0 };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: ++db.counter, error: null }),
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      let inserted: Record<string, unknown> | null = null;
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
        update: (p: Record<string, unknown>) => { patch = p; return api; },
        insert: (row: Record<string, unknown>) => { inserted = { id: `inv-${db.invoices.length + 1}`, email_sent_at: null, email_error: null, ...row }; db.invoices.push(inserted); return api; },
        single: async () => ({ data: inserted, error: null }),
        maybeSingle: async () => {
          if (table === "organization_billing_details") return { data: db.details };
          if (table === "platform_invoices") return { data: db.invoices.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null };
          return { data: { name: "Grace Church" } };
        },
        then: (resolve: (v: unknown) => void) => {
          if (patch && table === "platform_invoices") for (const r of db.invoices) if (filters.every(([k, v]) => r[k] === v)) Object.assign(r, patch);
          resolve({ data: null });
        },
      };
      return api;
    },
  }),
}));

const details = { legal_name: "Grace Church Trust", gstin: null, address_line1: "12 Church Road", address_line2: null, city: "Pune", state: "Maharashtra", pincode: "411001", email: "billing@grace.test", phone: null };

describe("issueInvoice", () => {
  beforeEach(() => {
    db.invoices = [];
    db.counter = 0;
    db.details = details;
    sendBulkEmail.mockClear();
  });

  it("numbers the invoice, adds 18% GST and splits it for a buyer in the seller's state", async () => {
    const { issueInvoice } = await import("@/lib/invoices/issue");
    const result = await issueInvoice({ organizationId: "org", kind: "addon", reference: "addon1", description: "Add-on pack: 500 SMS credits", baseAmount: 399, issuedAt: new Date("2026-10-14T06:00:00Z") });
    expect("invoice" in result).toBe(true);
    if (!("invoice" in result)) return;
    expect(result.invoice).toMatchObject({ invoice_number: "KF/26-27/000001", subtotal: 399, cgst: 35.91, sgst: 35.91, igst: 0, total: 470.82, place_of_supply: "Maharashtra" });
  });

  it("charges IGST to a buyer in another state", async () => {
    db.details = { ...details, state: "Kerala" };
    const { issueInvoice } = await import("@/lib/invoices/issue");
    const result = await issueInvoice({ organizationId: "org", kind: "subscription", reference: "sub1", description: "Starter plan", baseAmount: 1499 });
    if (!("invoice" in result)) throw new Error("not issued");
    expect(result.invoice).toMatchObject({ cgst: 0, sgst: 0, igst: 269.82, total: 1768.82 });
  });

  it("is idempotent: the same payment gets one invoice, and the next number isn't used up", async () => {
    const { issueInvoice } = await import("@/lib/invoices/issue");
    const input = { organizationId: "org", kind: "addon" as const, reference: "addon2", description: "x", baseAmount: 100 };
    const a = await issueInvoice(input);
    const b = await issueInvoice(input);
    if (!("invoice" in a) || !("invoice" in b)) throw new Error("not issued");
    expect(b.invoice.id).toBe(a.invoice.id);
    expect(db.invoices).toHaveLength(1);
    expect(db.counter).toBe(1);
  });

  it("emails the invoice as a PDF to the billing email, and records that it went", async () => {
    const { issueAndEmailInvoice } = await import("@/lib/invoices/issue");
    const id = await issueAndEmailInvoice({ organizationId: "org", kind: "addon", reference: "addon3", description: "Add-on pack: 2,000 email credits", baseAmount: 199 });
    expect(id).toBeTruthy();
    // The church's invoice, then our own copy.
    expect(sendBulkEmail).toHaveBeenCalledTimes(2);
    const call = (sendBulkEmail.mock.calls[0] as unknown as [{ recipients: string[]; attachments: { filename: string; contentType: string; content: Buffer }[]; subject: string }])[0];
    expect(call.recipients).toEqual(["billing@grace.test"]);
    expect(call.subject).toMatch(/KF\/26-27\/\d{6}/);
    expect(call.attachments[0].filename).toMatch(/^Invoice-KF-.*\.pdf$/);
    expect(call.attachments[0].content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(db.invoices[0].email_sent_at).toBeTruthy();

    const copy = (sendBulkEmail.mock.calls[1] as unknown as [{ recipients: string[]; subject: string; attachments: { content: Buffer }[] }])[0];
    expect(copy.recipients).toEqual(["admin@kingdomflow.in"]);
    expect(copy.subject).toMatch(/^\[Copy\] Tax invoice KF\/26-27\/\d{6} — Grace Church Trust/);
    expect(copy.attachments[0].content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(db.invoices[0].copy_emailed_at).toBeTruthy();
  });

  it("sends our copy even when the church has no email, and only once", async () => {
    db.details = { ...details, email: "" };
    const { issueAndEmailInvoice, emailInvoice } = await import("@/lib/invoices/issue");
    await issueAndEmailInvoice({ organizationId: "org", kind: "addon", reference: "addon4", description: "Add-on pack", baseAmount: 199 });
    expect(sendBulkEmail).toHaveBeenCalledTimes(1);
    expect(db.invoices[0].email_error).toBe("No billing email on file.");
    // Sending it to the church again later doesn't send our copy again.
    await emailInvoice(db.invoices[0] as never);
    expect(sendBulkEmail).toHaveBeenCalledTimes(1);
  });
});

describe("invoiceCopyRecipients", () => {
  it("prefers INVOICE_COPY_EMAIL, else the platform inbox (not the template email)", async () => {
    const { invoiceCopyRecipients } = await import("@/lib/invoices/issue");
    expect(invoiceCopyRecipients(" a@x.com, b@x.com ")).toEqual(["a@x.com", "b@x.com"]);
    expect(invoiceCopyRecipients("")).toEqual(["admin@kingdomflow.in"]);
    expect(invoiceCopyRecipients(undefined)).toEqual(["admin@kingdomflow.in"]);
  });
});
