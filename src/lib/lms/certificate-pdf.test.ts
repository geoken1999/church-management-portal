import { describe, expect, it } from "vitest";
import { renderCertificatePdf, type CertificateData } from "./certificate-pdf";

const data: CertificateData = {
  code: "ABC123DEF456",
  studentName: "Anna Thomas",
  title: "Foundations of Faith",
  kind: "course",
  organizationName: "Grace Community Church",
  percent: 92.5,
  issuedAt: "2026-10-19T10:00:00Z",
  signerName: "Pastor John",
  signerTitle: "Senior Pastor",
  verifyUrl: "https://example.org/verify/certificate/ABC123DEF456",
};

describe("renderCertificatePdf", () => {
  it("produces a PDF", () => {
    const bytes = renderCertificatePdf(data);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1500);
  });
  it("copes with no signer, no result and names in other scripts", () => {
    const bytes = renderCertificatePdf({
      ...data,
      signerName: null,
      signerTitle: null,
      percent: null,
      studentName: "அன்னா தாமஸ்",
    });
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });
});
