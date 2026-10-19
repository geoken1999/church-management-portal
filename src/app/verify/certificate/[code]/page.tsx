import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeLetter } from "@/lib/lms/quiz";
import { CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Check a certificate | KingdomFlow",
  robots: { index: false },
};

// Anyone with a certificate's code can check that it is real. Only the name, what it is for, the date and
// the result are shown.
export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const valid = /^[A-Za-z0-9]{12}$/.test(code);
  const row = valid
    ? (
        await createAdminClient().rpc("lms_verify_certificate", {
          p_code: code,
        })
      ).data?.[0]
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        {!row ? (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h1 className="font-heading text-xl font-bold">
              Certificate not found
            </h1>
            <p className="text-sm text-muted-foreground">
              We have no certificate with the code{" "}
              {valid ? code.toUpperCase() : "you typed"}. Check the code printed
              on the certificate and try again.
            </p>
          </>
        ) : row.revoked ? (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h1 className="font-heading text-xl font-bold">
              This certificate was withdrawn
            </h1>
            <p className="text-sm text-muted-foreground">
              The certificate {row.code} for {row.student_name} is no longer
              valid.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <h1 className="font-heading text-xl font-bold">
              Valid certificate
            </h1>
            <p className="text-sm text-muted-foreground">
              {row.organization_name}
            </p>
            <p className="text-2xl font-bold">{row.student_name}</p>
            <p className="text-sm">completed the {row.kind}</p>
            <p className="text-lg font-semibold">{row.title}</p>
            {row.percent !== null && (
              <p className="text-sm text-muted-foreground">
                Result {row.percent}% (grade {gradeLetter(Number(row.percent))})
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Issued{" "}
              {new Date(row.issued_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="text-xs text-muted-foreground">Code {row.code}</p>
          </>
        )}
      </div>
    </div>
  );
}
