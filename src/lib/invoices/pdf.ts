import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { addressLines, type InvoiceDocument } from "@/lib/invoices/document";
import { amountInWords } from "@/lib/invoices/numbers";

// The standard PDF fonts have no rupee sign, so amounts are written "Rs.".
const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export interface InvoiceLogo {
  dataUrl: string;
  format: "PNG" | "JPEG";
}

// A tax invoice as a PDF (A4). Returns the file's bytes.
export function renderInvoicePdf(invoice: InvoiceDocument, logo?: InvoiceLogo | null): Buffer {
  const t = invoice.template;
  const accent = rgb(t.accentColor);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // Top bar in the brand colour.
  doc.setFillColor(...accent);
  doc.rect(0, 0, width, 6, "F");

  // Company, left; "TAX INVOICE" and numbers, right.
  let textX = margin;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, margin, y, 20, 20);
      textX = margin + 24;
    } catch {
      // A logo that can't be drawn is left out rather than failing the invoice.
    }
  }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20, 20, 20);
  doc.text(invoice.seller.name, textX, y + 5);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90, 90, 90);
  let sy = y + 10;
  for (const line of addressLines(invoice.seller)) {
    doc.text(line, textX, sy);
    sy += 4;
  }
  const contact = [invoice.seller.email, invoice.seller.phone, invoice.seller.website].filter(Boolean).join("  |  ");
  if (contact) {
    doc.text(contact, textX, sy);
    sy += 4;
  }
  const ids = [invoice.seller.gstin && `GSTIN: ${invoice.seller.gstin}`, invoice.seller.pan && `PAN: ${invoice.seller.pan}`].filter(Boolean).join("   ");
  if (ids) {
    doc.text(ids, textX, sy);
    sy += 4;
  }

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...accent);
  doc.text("TAX INVOICE", width - margin, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(40, 40, 40);
  doc.text(`Invoice no: ${invoice.invoiceNumber}`, width - margin, y + 13, { align: "right" });
  doc.text(`Date: ${dateLabel(invoice.issuedAt)}`, width - margin, y + 18, { align: "right" });
  doc.text(`Payment ref: ${invoice.reference}`, width - margin, y + 23, { align: "right" });

  y = Math.max(sy, y + 28) + 4;
  doc.setDrawColor(220, 220, 220).line(margin, y, width - margin, y);
  y += 6;

  // Bill to.
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...accent);
  doc.text("BILL TO", margin, y);
  doc.text("PLACE OF SUPPLY", width / 2 + 10, y);
  y += 5;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 20, 20);
  doc.text(invoice.buyer.name, margin, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 60);
  let by = y + 4.5;
  for (const line of addressLines(invoice.buyer)) {
    doc.text(line, margin, by);
    by += 4.2;
  }
  if (invoice.buyer.gstin) {
    doc.text(`GSTIN: ${invoice.buyer.gstin}`, margin, by);
    by += 4.2;
  }
  if (invoice.buyer.email) {
    doc.text(invoice.buyer.email, margin, by);
    by += 4.2;
  }
  doc.text(invoice.placeOfSupply || invoice.buyer.state, width / 2 + 10, y);
  y = Math.max(by, y + 10) + 4;

  // Items.
  const showSac = t.showSac;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Description", ...(showSac ? ["SAC"] : []), "Qty", "Rate", "Amount"]],
    body: invoice.lineItems.map((item, i) => [String(i + 1), item.description, ...(showSac ? [item.hsn] : []), String(item.quantity), money(item.unitPrice), money(item.amount)]),
    headStyles: { fillColor: accent, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 9, textColor: 40 },
    columnStyles: { 0: { cellWidth: 9 }, [showSac ? 4 : 3]: { halign: "right" }, [showSac ? 5 : 4]: { halign: "right" } },
    theme: "grid",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Totals, right-aligned.
  const rows: [string, string, boolean][] = [["Subtotal", money(invoice.subtotal), false]];
  const half = `${((invoice.gstRate * 100) / 2).toFixed(0)}%`;
  if (invoice.igst > 0) rows.push([`IGST @ ${(invoice.gstRate * 100).toFixed(0)}%`, money(invoice.igst), false]);
  else {
    rows.push([`CGST @ ${half}`, money(invoice.cgst), false]);
    rows.push([`SGST @ ${half}`, money(invoice.sgst), false]);
  }
  rows.push(["Total", money(invoice.total), true]);
  const labelX = width - margin - 70;
  for (const [label, value, bold] of rows) {
    if (bold) {
      doc.setFillColor(...accent).rect(labelX - 3, y - 4.5, 75, 7, "F");
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(255, 255, 255);
    } else {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(50, 50, 50);
    }
    doc.text(label, labelX, y);
    doc.text(value, width - margin, y, { align: "right" });
    y += 7;
  }
  y += 1;
  doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(70, 70, 70);
  const words = doc.splitTextToSize(`Amount in words: ${amountInWords(invoice.total)}`, width - 2 * margin);
  doc.text(words, margin, y);
  y += words.length * 4 + 4;

  // Bank details, terms, notes.
  const blocks: [string, string[]][] = [];
  if (t.showBankDetails) {
    const bank = [t.accountName && `Account name: ${t.accountName}`, t.bankName && `Bank: ${t.bankName}`, t.accountNumber && `Account no: ${t.accountNumber}`, t.ifsc && `IFSC: ${t.ifsc}`, t.upiId && `UPI: ${t.upiId}`].filter(Boolean) as string[];
    if (bank.length) blocks.push(["PAYMENT DETAILS", bank]);
  }
  if (t.notes) blocks.push(["NOTES", doc.splitTextToSize(t.notes, width - 2 * margin)]);
  if (t.terms) blocks.push(["TERMS", doc.splitTextToSize(t.terms, width - 2 * margin)]);
  for (const [title, lines] of blocks) {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...accent);
    doc.text(title, margin, y);
    y += 4;
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(70, 70, 70);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 3;
  }

  // Signature and footer at the bottom of the last page.
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(70, 70, 70);
  doc.text(`For ${invoice.seller.name}`, width - margin, pageHeight - 32, { align: "right" });
  doc.setDrawColor(150, 150, 150).line(width - margin - 50, pageHeight - 18, width - margin, pageHeight - 18);
  doc.text(t.signatureLabel, width - margin, pageHeight - 14, { align: "right" });
  if (t.footer) {
    doc.setFontSize(8.5).setTextColor(...accent);
    doc.text(t.footer, margin, pageHeight - 10);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
