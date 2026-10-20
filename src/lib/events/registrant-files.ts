import "server-only";

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RegistrantTable } from "@/lib/events/registrant-table";

export function buildRegistrantsWorkbook(
  table: RegistrantTable,
  sheetName: string,
): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  // Wide enough for the longest value in each column (capped), so the file
  // opens readable instead of with every column squeezed.
  sheet["!cols"] = table.headers.map((header, column) => ({
    wch: Math.min(
      40,
      Math.max(
        header.length,
        ...table.rows.map((row) => (row[column] ?? "").length),
      ) + 2,
    ),
  }));
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters, and can't contain : \ / ? * [ ]
  XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Registrants",
  );
  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
}

export function buildRegistrantsPdf(
  table: RegistrantTable,
  meta: {
    organizationName: string;
    eventTitle: string;
    eventDate: string;
    registered: number;
    checkedIn: number;
    cancelled: number;
  },
): ArrayBuffer {
  // More questions on the form means more columns: use a bigger page and
  // smaller type rather than letting the table run off the edge.
  const wide = table.headers.length > 12;
  const doc = new jsPDF({
    orientation: "landscape",
    format: wide ? "a3" : "a4",
  });

  doc.setFontSize(14);
  doc.text(`${meta.eventTitle} — Registrants`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${meta.organizationName} · ${meta.eventDate}`, 14, 21);
  doc.text(
    `${table.rows.length} registration${table.rows.length === 1 ? "" : "s"} · ${meta.checkedIn} checked in · ${meta.registered} not yet checked in · ${meta.cancelled} cancelled`,
    14,
    26,
  );

  autoTable(doc, {
    startY: 31,
    head: [table.headers],
    body: table.rows,
    styles: {
      fontSize: wide ? 6.5 : 8,
      cellPadding: 1.8,
      overflow: "linebreak",
    },
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  return doc.output("arraybuffer");
}
