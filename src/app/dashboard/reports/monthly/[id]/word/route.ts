import { NextResponse } from "next/server";
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { getImageDimensions } from "@/lib/events/image-dimensions";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMonthlyReport } from "@/lib/reports/monthly-dal";
import { fullDateIn, reportLabels, type MonthlyReportData, type MonthlySectionKey } from "@/lib/reports/monthly";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Word shapes Tamil and Hindi itself, so one font name per script is enough.
const FONTS = { en: "Calibri", ta: "Latha", hi: "Mangal" } as const;

// Scales an image into a box without changing its shape (a flyer can be tall or wide).
function fit(data: Buffer, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const size = getImageDimensions(data);
  if (!size || size.width === 0 || size.height === 0) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

async function fetchImage(url: string): Promise<{ data: Buffer; type: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = /png/i.test(res.headers.get("content-type") ?? "") ? "png" : /jpe?g/i.test(res.headers.get("content-type") ?? "") ? "jpg" : null;
    return type ? { data: Buffer.from(await res.arrayBuffer()), type } : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  if (!membership.tabAccess.reports.read) return NextResponse.json({ error: "No access" }, { status: 403 });
  const report = await getMonthlyReport(membership.organization.id, id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: MonthlyReportData = report.data;
  const t = { ...reportLabels(data.language ?? "en"), ...(data.labels ?? {}) };
  const font = FONTS[data.language ?? "en"];
  const annual = data.kind === "annual";
  const head = data.letterhead;
  const text = (value: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text: value, font, bold: opts.bold, size: opts.size, color: opts.color });
  const para = (value: string, opts: { bold?: boolean; size?: number; color?: string; center?: boolean } = {}) =>
    new Paragraph({ spacing: { after: 120 }, alignment: opts.center ? AlignmentType.CENTER : undefined, children: [text(value, opts)] });
  const heading = (value: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [text(value, { bold: true, size: 28 })] });
  const row = (label: string, value: string) =>
    new TableRow({ children: [new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, children: [para(label)] }), new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, children: [para(value, { bold: true })] })] });
  const table = (rows: [string, string][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(([l, v]) => row(l, v)) });
  const words = (key: MonthlySectionKey) => (data.narrative?.sections?.[key] ? [para(data.narrative.sections[key]!)] : []);

  const body: (Paragraph | Table)[] = [];

  const logo = data.logoUrl ? await fetchImage(data.logoUrl) : null;
  if (logo) body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: logo.type, data: logo.data, transformation: { width: 70, height: 70 } })] }));
  if (head?.churchName) body.push(para(head.churchName, { bold: true, size: 36, center: true }));
  for (const line of [head?.address, [head?.phone, head?.email, head?.website].filter(Boolean).join("  ·  ")]) if (line) body.push(para(line, { size: 20, color: "666666", center: true }));

  body.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { before: 300 }, children: [text(`${annual ? t.titleAnnual : t.titleMonthly}: ${data.label}`, { bold: true, size: 44 })] }));
  body.push(para(`${data.branchName ? `${t.branch}: ${data.branchName}` : t.wholeChurch} · ${t.madeOn} ${fullDateIn(data.generatedAt, data.language ?? "en")}`, { size: 20, color: "666666" }));

  if (data.narrative) {
    body.push(heading(t.summary));
    for (const p of data.narrative.text.split(/\n{2,}/)) body.push(para(p));
    for (const h of data.narrative.highlights) body.push(new Paragraph({ bullet: { level: 0 }, children: [text(h)] }));
    body.push(para(t.aiNote, { size: 18, color: "888888" }));
  }
  if (report.note) body.push(para(report.note));

  if (data.members) body.push(heading(t.members), ...words("members"), table([[t.onRecord, String(data.members.total)], [annual ? t.joinedYear : t.joinedMonth, String(data.members.joined)]]));
  if (data.attendance) {
    const rows: [string, string][] = [[t.services, String(data.attendance.services)], [t.average, String(data.attendance.average)], [t.totalAttendance, String(data.attendance.total)]];
    if (data.attendance.best) rows.push([`${t.best} (${data.attendance.best.title}, ${data.attendance.best.dateLabel ?? data.attendance.best.date})`, String(data.attendance.best.count)]);
    body.push(heading(t.attendance), ...words("attendance"), table(rows));
  }
  if (data.giving) body.push(heading(t.giving), ...words("giving"), table([[t.offerings, rupees(data.giving.offerings)], [t.donations, rupees(data.giving.donations)], [t.total, rupees(data.giving.total)], ...data.giving.byCategory.map((c): [string, string] => [`  ${c.name}`, rupees(c.amount)])]));
  if (data.expenses) body.push(heading(t.expensesBalance), ...words("expenses"), table([[t.givingReceived, rupees(data.expenses.income)], [t.expenses, rupees(data.expenses.expenses)], [t.leftOver, rupees(data.expenses.balance)]]));
  if (data.byMonth) body.push(heading(t.byMonth), table(data.byMonth.map((m): [string, string] => [m.month, `${t.giving}: ${rupees(m.giving)}  ·  ${t.expenses}: ${rupees(m.expenses)}`])));
  if (data.events) {
    body.push(heading(t.events), ...words("events"), table([[t.eventsHeld, String(data.events.held)], ...data.events.list.map((e): [string, string] => [e.title, e.dateLabel ?? e.date])]));
    const reportBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/report-images/`;
    for (const e of data.events.list) {
      if (!e.flyerPath) continue;
      const flyer = await fetchImage(`${reportBase}${e.flyerPath}`);
      if (!flyer) continue;
      body.push(new Paragraph({ spacing: { before: 160 }, children: [new ImageRun({ type: flyer.type, data: flyer.data, transformation: fit(flyer.data, 300, 420) })] }));
      body.push(para(`${e.title} · ${e.dateLabel ?? e.date}`, { size: 18, color: "666666" }));
    }
  }
  if (data.volunteers) body.push(heading(t.volunteers), ...words("volunteers"), table([[t.active, String(data.volunteers.active)], [annual ? t.joinedYear : t.joinedMonth, String(data.volunteers.joined)]]));
  if (data.prayer) body.push(heading(t.prayer), ...words("prayer"), table([[t.received, String(data.prayer.received)], [t.answered, String(data.prayer.answered)]]));

  if (data.photos?.length) {
    body.push(heading(t.photos));
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/report-images/`;
    for (const photo of data.photos) {
      const image = await fetchImage(`${base}${photo.path}`);
      if (!image) continue;
      body.push(new Paragraph({ spacing: { before: 120 }, children: [new ImageRun({ type: image.type, data: image.data, transformation: { width: 400, height: 300 } })] }));
      if (photo.caption) body.push(para(photo.caption, { size: 18, color: "666666" }));
    }
  }

  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: body }] }));
  const name = `${head?.churchName ?? "Church"} report ${report.period}`.replace(/[^\w\- ]+/g, "").trim() || "Church report";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}.docx"`,
    },
  });
}
