import { normalizeInvoiceTemplate, type InvoiceTemplate } from "@/lib/invoices/template";
import type { PlatformInvoice, PlatformInvoiceLineItem } from "@/types/database";

// Everything an invoice shows, in one plain object: built from the saved invoice (or a sample).
export interface InvoiceParty {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  email: string;
  phone: string;
  pan?: string;
  website?: string;
}

export interface InvoiceDocument {
  invoiceNumber: string;
  issuedAt: string;
  reference: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  template: InvoiceTemplate;
  lineItems: PlatformInvoiceLineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  gstRate: number;
  placeOfSupply: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function partyFromRecord(r: Record<string, unknown>): InvoiceParty {
  return {
    name: str(r.name) || str(r.legalName) || str(r.companyName),
    addressLine1: str(r.addressLine1),
    addressLine2: str(r.addressLine2),
    city: str(r.city),
    state: str(r.state),
    pincode: str(r.pincode),
    gstin: str(r.gstin),
    email: str(r.email),
    phone: str(r.phone),
    pan: str(r.pan),
    website: str(r.website),
  };
}

export function sellerFromTemplate(t: InvoiceTemplate): InvoiceParty {
  return { name: t.companyName, addressLine1: t.addressLine1, addressLine2: t.addressLine2, city: t.city, state: t.state, pincode: t.pincode, gstin: t.gstin, email: t.email, phone: t.phone, pan: t.pan, website: t.website };
}

export function documentFromInvoice(row: PlatformInvoice): InvoiceDocument {
  return {
    invoiceNumber: row.invoice_number,
    issuedAt: row.issued_at,
    reference: row.reference,
    seller: partyFromRecord(row.seller),
    buyer: partyFromRecord(row.buyer),
    template: normalizeInvoiceTemplate(row.template),
    lineItems: row.line_items,
    subtotal: Number(row.subtotal),
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    igst: Number(row.igst),
    total: Number(row.total),
    gstRate: Number(row.gst_rate),
    placeOfSupply: row.place_of_supply ?? "",
  };
}

export const addressLines = (p: InvoiceParty): string[] => [p.addressLine1, p.addressLine2, [p.city, p.state, p.pincode].filter(Boolean).join(", ")].filter(Boolean);

// A made-up invoice, to show how a template looks before any real one exists.
export function sampleDocument(template: InvoiceTemplate): InvoiceDocument {
  const subtotal = 1499;
  const gst = 269.82;
  const intra = true;
  return {
    invoiceNumber: `${template.prefix}/26-27/000001`,
    issuedAt: new Date().toISOString(),
    reference: "sub1700000000000abcd1234",
    seller: sellerFromTemplate(template),
    buyer: { name: "Grace Church", addressLine1: "12 Church Road", addressLine2: "", city: "Mumbai", state: template.state || "Maharashtra", pincode: "400001", gstin: "", email: "admin@grace.example", phone: "+91 98765 43210" },
    template,
    lineItems: [{ description: "Starter plan subscription (monthly)", hsn: template.sacCode, quantity: 1, unitPrice: subtotal, amount: subtotal }],
    subtotal,
    cgst: intra ? gst / 2 : 0,
    sgst: intra ? gst / 2 : 0,
    igst: intra ? 0 : gst,
    total: subtotal + gst,
    gstRate: 0.18,
    placeOfSupply: template.state || "Maharashtra",
  };
}
