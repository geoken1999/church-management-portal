// GST on what KingdomFlow sells. Prices are listed without GST; 18% is added when paying.
// Plain functions (no server code) so the pricing page, checkout and invoices all agree.

export const GST_RATE = 0.18;
export const GST_PERCENT = 18;

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;

export interface GstBreakdown {
  base: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  total: number;
  // Same state as the seller: GST is split into CGST and SGST. Otherwise it is IGST.
  intraState: boolean;
}

// GST on a price without GST. Within the seller's state it is half CGST, half SGST; between
// states it is all IGST. Worked in whole paise so the parts always add up to the total.
export function gstBreakdown(
  baseRupees: number,
  buyerState: string | null | undefined,
  sellerState: string | null | undefined,
): GstBreakdown {
  const base = paise(baseRupees);
  const gst = Math.round(base * GST_RATE);
  const intraState = Boolean(
    buyerState &&
    sellerState &&
    normalizeState(buyerState) === normalizeState(sellerState),
  );
  const cgst = intraState ? Math.floor(gst / 2) : 0;
  const sgst = intraState ? gst - cgst : 0;
  const igst = intraState ? 0 : gst;
  return {
    base: rupees(base),
    cgst: rupees(cgst),
    sgst: rupees(sgst),
    igst: rupees(igst),
    gst: rupees(gst),
    total: rupees(base + gst),
    intraState,
  };
}

// What a price comes to with GST, for showing and charging: price, the GST on it, the total.
export function withGst(baseRupees: number): {
  base: number;
  gst: number;
  total: number;
} {
  const b = paise(baseRupees);
  const g = Math.round(b * GST_RATE);
  return { base: rupees(b), gst: rupees(g), total: rupees(b + g) };
}

export const normalizeState = (state: string) => state.trim().toLowerCase();

export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A whole-rupee price for display, e.g. ₹1,499 (no decimals unless there are some).
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
