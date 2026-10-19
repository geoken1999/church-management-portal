"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeCertificateAction } from "@/lib/lms/quiz-actions";
import type { LmsCertificate } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

export function CertificatesPanel({
  organizationId,
  certificates,
  canRevoke,
}: {
  organizationId: string;
  certificates: LmsCertificate[];
  canRevoke: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(c: LmsCertificate) {
    const reason = prompt(
      `Take back ${c.student_name}'s certificate for ${c.title}? Say why (optional):`,
    );
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeCertificateAction(
        organizationId,
        c.id,
        reason,
      ).catch(
        () =>
          ({ error: "Something went wrong. Please try again." }) as {
            error?: string;
          },
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (certificates.length === 0)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No certificates yet. They are given automatically when a student
          finishes a course or a program.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-2">
      <ErrorToast message={error} />
      {certificates.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {c.student_name}
                <span className="ml-2 font-normal text-muted-foreground">
                  {c.title}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {c.program_id ? "Program" : "Course"} · {c.code} ·{" "}
                {new Date(c.issued_at).toLocaleDateString("en-IN")}
                {c.percent !== null ? ` · ${c.percent}%` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {c.revoked_at && <Badge variant="destructive">Revoked</Badge>}
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={`/api/certificate/${c.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PDF
                  </a>
                }
              />
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={`/verify/certificate/${c.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Check
                  </a>
                }
              />
              {canRevoke && !c.revoked_at && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => revoke(c)}
                >
                  Revoke
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
