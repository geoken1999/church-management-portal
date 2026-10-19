import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getCertificates } from "@/lib/lms/dal";
import { CertificatesPanel } from "@/components/bible-school/CertificatesPanel";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Certificates | Bible School | KingdomFlow",
};
export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const membership = await requireOrganization();
  if (!membership.tabAccess.bibleschool.write)
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Only school administrators can see all certificates.
        </CardContent>
      </Card>
    );
  const certificates = await getCertificates(membership.organization.id);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold">
          Certificates ({certificates.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          Given automatically when a student finishes a course or a program.
          Anyone with a certificate&apos;s code can check it at
          /verify/certificate/CODE. Turn certificates off, or set who signs
          them, in Settings.
        </p>
      </div>
      <CertificatesPanel
        organizationId={membership.organization.id}
        certificates={certificates}
        canRevoke
      />
    </div>
  );
}
