import { jsPDF } from "jspdf";
import { gradeLetter } from "@/lib/lms/quiz";

export interface CertificateData {
  code: string;
  studentName: string;
  title: string;
  kind: "course" | "program";
  organizationName: string;
  percent: number | null;
  issuedAt: string;
  signerName: string | null;
  signerTitle: string | null;
  verifyUrl: string;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

// The standard PDF fonts cannot draw every script, so characters outside Latin-1 are replaced to keep the
// text readable rather than printing boxes. Names in other scripts still appear on the verification page.
const latin = (text: string) => text.replace(/[^ -ÿ]/g, "?");

// A certificate of completion as a landscape A4 PDF. Returns the file's bytes.
export function renderCertificatePdf(data: CertificateData): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const centre = (text: string, y: number) =>
    doc.text(latin(text), w / 2, y, { align: "center", maxWidth: w - 50 });

  // Double border.
  doc.setDrawColor(40, 70, 120);
  doc.setLineWidth(1.6);
  doc.rect(8, 8, w - 16, h - 16);
  doc.setLineWidth(0.4);
  doc.rect(12, 12, w - 24, h - 24);

  doc.setTextColor(40, 70, 120);
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  centre(data.organizationName.toUpperCase(), 32);

  doc.setFont("times", "bold");
  doc.setFontSize(34);
  centre("Certificate of Completion", 52);

  doc.setTextColor(60, 60, 60);
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  centre("This certifies that", 70);

  doc.setTextColor(20, 20, 20);
  doc.setFont("times", "bolditalic");
  doc.setFontSize(32);
  centre(data.studentName, 88);

  doc.setTextColor(60, 60, 60);
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  centre(`has successfully completed the ${data.kind}`, 104);

  doc.setTextColor(20, 20, 20);
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  centre(data.title, 118);

  if (data.percent !== null) {
    doc.setTextColor(60, 60, 60);
    doc.setFont("times", "normal");
    doc.setFontSize(13);
    centre(
      `Result: ${data.percent}% (grade ${gradeLetter(data.percent)})`,
      130,
    );
  }

  // Date on the left, signature on the right.
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.3);
  doc.line(30, h - 42, 100, h - 42);
  doc.line(w - 100, h - 42, w - 30, h - 42);
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(11);
  doc.text(dateLabel(data.issuedAt), 65, h - 36, { align: "center" });
  doc.setFontSize(9);
  doc.text("Date", 65, h - 31, { align: "center" });
  if (data.signerName) {
    doc.setFontSize(11);
    doc.text(latin(data.signerName), w - 65, h - 36, { align: "center" });
    doc.setFontSize(9);
    doc.text(
      latin(data.signerTitle ?? "Authorised signatory"),
      w - 65,
      h - 31,
      { align: "center" },
    );
  }

  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  centre(`Certificate ${data.code} · Check it at ${data.verifyUrl}`, h - 18);

  return Buffer.from(doc.output("arraybuffer"));
}
