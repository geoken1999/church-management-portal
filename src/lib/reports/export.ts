import "server-only";

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportDefinition } from "@/lib/reports/registry";

export function buildReportWorkbook(definition: ReportDefinition, rows: Record<string, string>[]): ArrayBuffer {
  const headers = definition.columns.map((column) => column.label);
  const body = rows.map((row) => definition.columns.map((column) => row[column.key] ?? ""));

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters by the xlsx format itself.
  XLSX.utils.book_append_sheet(workbook, sheet, definition.label.slice(0, 31));

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildReportPdf(definition: ReportDefinition, rows: Record<string, string>[], organizationName: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: definition.columns.length > 5 ? "landscape" : "portrait" });

  doc.setFontSize(14);
  doc.text(`${organizationName} — ${definition.label} Report`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const generatedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.text(`Generated ${generatedOn} · ${rows.length} record${rows.length === 1 ? "" : "s"}`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [definition.columns.map((column) => column.label)],
    body: rows.map((row) => definition.columns.map((column) => row[column.key] ?? "")),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: Object.fromEntries(
      definition.columns.map((column, index) => [index, { halign: column.align === "right" ? "right" : "left" }]),
    ),
  });

  return doc.output("arraybuffer");
}
