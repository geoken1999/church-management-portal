import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderCertificatePdf } from "@/lib/lms/certificate-pdf";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// The certificate as a PDF. The 12-character code is the key (it is printed on the certificate and given to the
// student); the PDF holds only their name, what they finished, the result and the date.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{12}$/.test(code))
    return NextResponse.json(
      { error: "Certificate not found." },
      { status: 404 },
    );
  try {
    const admin = createAdminClient();
    const { data: cert } = await admin
      .from("lms_certificates")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!cert)
      return NextResponse.json(
        { error: "Certificate not found." },
        { status: 404 },
      );
    if (cert.revoked_at)
      return NextResponse.json(
        { error: "This certificate has been withdrawn." },
        { status: 410 },
      );
    const { data: settings } = await admin
      .from("lms_settings")
      .select("certificate_signer_name, certificate_signer_title")
      .eq("organization_id", cert.organization_id)
      .maybeSingle();
    const bytes = renderCertificatePdf({
      code: cert.code,
      studentName: cert.student_name,
      title: cert.title,
      kind: cert.program_id ? "program" : "course",
      organizationName: cert.organization_name,
      percent: cert.percent === null ? null : Number(cert.percent),
      issuedAt: cert.issued_at,
      signerName: settings?.certificate_signer_name ?? null,
      signerTitle: settings?.certificate_signer_title ?? null,
      verifyUrl: `${getSiteUrl()}/verify/certificate/${cert.code}`,
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificate-${cert.code}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("certificate pdf failed:", err);
    return NextResponse.json(
      { error: "Couldn't make the certificate. Please try again." },
      { status: 500 },
    );
  }
}
