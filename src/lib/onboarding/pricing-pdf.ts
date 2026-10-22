import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ADDON_PACKS,
  ADDON_TYPE_LABELS,
  PLANS,
  type PlanLimits,
} from "@/lib/plans/config";
import { PLAN_ORDER } from "@/lib/plans/display";
import {
  CREDIT_TYPES,
  ONBOARDING_MODULES,
  STEPPED_CREDITS,
} from "@/lib/onboarding/config";

// A price sheet for the platform admin to share: plans, module prices, the block prices of a custom package and the
// add-on packs. The standard PDF fonts have no rupee sign, so amounts are written "Rs.".
const rs = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const limit = (value: number | null, unit = "") =>
  value === null ? "Unlimited" : `${value.toLocaleString("en-IN")}${unit}`;

export interface PricingSheetData {
  /** Monthly price per module key, before GST (from the Modules & pricing page). */
  modulePrices: Record<string, number>;
  generatedAt: Date;
}

const ACCENT: [number, number, number] = [40, 70, 120];

function planRows(): string[][] {
  const plans = PLAN_ORDER.map((id) => PLANS[id]);
  const row = (label: string, value: (p: PlanLimits) => string) => [
    label,
    ...plans.map(value),
  ];
  return [
    row("Price per month", (p) => rs(p.priceInRupees)),
    row("Members", (p) => limit(p.memberLimit)),
    row("Branches", (p) => limit(p.branchLimit)),
    row("Forms", (p) => limit(p.formsLimit)),
    row("Chat groups", (p) => limit(p.groupLimit)),
    row("Storage", (p) => `${Math.round(p.storageBytes / 1024 ** 3)} GB`),
    row("Emails a month", (p) => limit(p.emailsPerMonth)),
    row("SMS a month", (p) => limit(p.smsPerMonth)),
    row("WhatsApp a month", (p) => limit(p.whatsappPerMonth)),
    row("AI replies a month", (p) => limit(p.aiRepliesPerMonth)),
    row("Added admin logins", (p) => limit(p.maxAdditionalAdmins)),
    row("Added staff logins", (p) => limit(p.maxAdditionalStaff)),
    row(
      "Instagram / YouTube accounts",
      (p) => `${p.instagramAccountLimit} / ${p.youtubeAccountLimit}`,
    ),
    row("K-Connect video / audio minutes a month", (p) =>
      p.kmeetMaxDurationMinutes === null
        ? "Unlimited"
        : `${p.kmeetMaxDurationMinutes} / ${p.kmeetMaxDurationMinutes + 10}`,
    ),
  ];
}

export function renderPricingPdf(data: PricingSheetData): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, width, 6, "F");
  doc.setTextColor(...ACCENT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("KingdomFlow pricing", margin, y);
  y += 7;
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Prices are per month in rupees, before 18% GST (added at checkout). Prepared ${data.generatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}.`,
    margin,
    y,
    { maxWidth: width - margin * 2 },
  );
  y += 8;

  const heading = (text: string) => {
    if (y > 255) {
      doc.addPage();
      y = 16;
    }
    doc.setTextColor(...ACCENT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, margin, y);
    y += 3;
  };
  const table = (head: string[], body: string[][], widths?: number[]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: ACCENT, textColor: 255 },
      alternateRowStyles: { fillColor: [244, 246, 251] },
      columnStyles: widths
        ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }]))
        : undefined,
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 8;
  };

  heading("Plans");
  table(
    ["", ...PLAN_ORDER.map((id) => `${PLANS[id].name}`)],
    planRows(),
    [70, 37, 37, 37],
  );

  heading("Custom package: modules");
  const modules = ONBOARDING_MODULES.map((m) => [
    m.label,
    data.modulePrices[m.key] ? rs(data.modulePrices[m.key]) : "No price set",
  ]);
  table(["Module", "Per month"], modules, [130, 51]);

  heading("Custom package: limits (every limit starts at the Starter number)");
  const blocks = CREDIT_TYPES.map((t) => {
    const rule = STEPPED_CREDITS[t.key];
    return rule
      ? [
          `${t.label} (${t.unit})`,
          rule.included.toLocaleString("en-IN"),
          `+${rule.step.toLocaleString("en-IN")}`,
          rs(rule.price),
        ]
      : [`${t.label} (${t.unit})`, "Starter's number", "Priced by hand", "-"];
  });
  table(
    ["Limit", "Included (Starter)", "Each extra block", "Price per block"],
    blocks,
    [80, 38, 32, 31],
  );
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Limits go up one block at a time. Mobile app features are the Starter's for everyone.",
    margin,
    y - 4,
    { maxWidth: width - margin * 2 },
  );
  y += 2;

  heading("Add-on packs (bought any time, same rates)");
  const packs = ADDON_PACKS.map((p) => [
    ADDON_TYPE_LABELS[p.addonType],
    p.label,
    rs(p.priceInRupees),
  ]);
  table(["Type", "Pack", "Price"], packs, [50, 90, 41]);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "KingdomFlow - confidential price list. Prices may change; the price shown when an order is sent applies.",
    margin,
    288,
  );

  return Buffer.from(doc.output("arraybuffer"));
}
