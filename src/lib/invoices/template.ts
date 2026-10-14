// How KingdomFlow's invoices look and who they come from. Edited by Super Admin; saved as one
// setting, and copied into every invoice when it is issued, so an old invoice never changes.
export interface InvoiceTemplate {
  // Who the invoice is from.
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  website: string;
  // Look.
  logoUrl: string | null;
  accentColor: string;
  // Numbering: KF/26-27/000001
  prefix: string;
  // SAC code shown against each line.
  sacCode: string;
  showSac: boolean;
  // Payment details, terms and footer.
  showBankDetails: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  terms: string;
  notes: string;
  footer: string;
  signatureLabel: string;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  companyName: "KingdomFlow",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Maharashtra",
  pincode: "",
  gstin: "",
  pan: "",
  email: "billing@kingdomflow.in",
  phone: "",
  website: "https://www.kingdomflow.in",
  logoUrl: null,
  accentColor: "#1d4ed8",
  prefix: "KF",
  sacCode: "998314",
  showSac: true,
  showBankDetails: false,
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
  upiId: "",
  terms: "This is a computer-generated invoice and needs no signature. All amounts are in Indian rupees.",
  notes: "",
  footer: "Thank you for choosing KingdomFlow.",
  signatureLabel: "Authorised signatory",
};

export const SETTING_KEY = "invoice_template";

const text = (value: unknown, max: number, fallback: string) => (typeof value === "string" ? value.trim().slice(0, max) : fallback);
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

// Reads whatever was saved, filling anything missing from the defaults, so a template saved by
// an older version of the app (with fewer fields) still works.
export function normalizeInvoiceTemplate(raw: unknown): InvoiceTemplate {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_INVOICE_TEMPLATE;
  const color = typeof r.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.accentColor) ? r.accentColor : d.accentColor;
  const logo = typeof r.logoUrl === "string" && /^https:\/\//.test(r.logoUrl) ? r.logoUrl : null;
  return {
    companyName: text(r.companyName, 120, d.companyName) || d.companyName,
    addressLine1: text(r.addressLine1, 120, d.addressLine1),
    addressLine2: text(r.addressLine2, 120, d.addressLine2),
    city: text(r.city, 80, d.city),
    state: text(r.state, 60, d.state),
    pincode: text(r.pincode, 10, d.pincode),
    gstin: text(r.gstin, 15, d.gstin).toUpperCase(),
    pan: text(r.pan, 10, d.pan).toUpperCase(),
    email: text(r.email, 120, d.email),
    phone: text(r.phone, 30, d.phone),
    website: text(r.website, 120, d.website),
    logoUrl: logo,
    accentColor: color,
    prefix: (text(r.prefix, 8, d.prefix).replace(/[^A-Za-z0-9]/g, "").toUpperCase() || d.prefix),
    sacCode: text(r.sacCode, 10, d.sacCode),
    showSac: flag(r.showSac, d.showSac),
    showBankDetails: flag(r.showBankDetails, d.showBankDetails),
    bankName: text(r.bankName, 80, d.bankName),
    accountName: text(r.accountName, 80, d.accountName),
    accountNumber: text(r.accountNumber, 30, d.accountNumber),
    ifsc: text(r.ifsc, 15, d.ifsc).toUpperCase(),
    upiId: text(r.upiId, 60, d.upiId),
    terms: text(r.terms, 600, d.terms),
    notes: text(r.notes, 600, d.notes),
    footer: text(r.footer, 200, d.footer),
    signatureLabel: text(r.signatureLabel, 60, d.signatureLabel) || d.signatureLabel,
  };
}

// What has to be filled in before invoices can be issued (a real tax invoice needs these).
export function templateProblems(t: InvoiceTemplate): string[] {
  const problems: string[] = [];
  if (!t.companyName.trim()) problems.push("the company name");
  if (!t.addressLine1.trim() || !t.city.trim() || !t.pincode.trim()) problems.push("the company address");
  if (!t.state.trim()) problems.push("the state (it decides CGST and SGST, or IGST)");
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(t.gstin)) problems.push("a valid GSTIN");
  return problems;
}
