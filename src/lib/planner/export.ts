import "server-only";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Plan } from "@/types/database";

// "HH:MM" (24-hour, no date) -> "10:00 AM" — same plain string parse as
// the client-side formatter in PlannerManager.tsx (kept separate rather
// than shared, since this one runs server-side with no component to
// import from).
function formatTime(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = Number(hourStr);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function formatTimeCell(startTime: string | null, endTime: string | null): string {
  if (startTime && endTime) return `${formatTime(startTime)} – ${formatTime(endTime)}`;
  if (startTime) return formatTime(startTime);
  return "";
}

const STATUS_LABELS: Record<Plan["status"], string> = { draft: "Draft", active: "Active", completed: "Completed" };

// Only ever called for an Active plan (see plannerExportActions.ts — export
// is gated to that status), so there's no "Draft"/"Completed" copy to
// write; the status line still prints whatever it is, in case that gate
// ever loosens.
export function buildPlanPdf(
  plan: Pick<Plan, "title" | "notes" | "status" | "target_date" | "items">,
  organizationName: string,
  leaderNameById: Map<string, string>,
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait" });

  doc.setFontSize(16);
  doc.text(plan.title, 14, 17);

  doc.setFontSize(10);
  doc.setTextColor(120);
  const metaParts = [organizationName, STATUS_LABELS[plan.status]];
  if (plan.target_date) {
    metaParts.push(new Date(`${plan.target_date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  }
  doc.text(metaParts.join(" · "), 14, 24);

  let notesEndY = 24;
  if (plan.notes) {
    doc.setFontSize(10);
    doc.setTextColor(60);
    const wrapped = doc.splitTextToSize(plan.notes, 182);
    doc.text(wrapped, 14, 32);
    notesEndY = 32 + wrapped.length * 5;
  }

  const sortedItems = [...plan.items].sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });

  autoTable(doc, {
    startY: notesEndY + 8,
    head: [["Time", "Step", "Assigned to", "Done"]],
    body: sortedItems.map((item) => [
      formatTimeCell(item.startTime, item.endTime),
      item.text,
      item.assignedTo ? (leaderNameById.get(item.assignedTo) ?? "") : "",
      item.done ? "Yes" : "",
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 36 }, 3: { cellWidth: 16, halign: "center" } },
  });

  return doc.output("arraybuffer");
}
