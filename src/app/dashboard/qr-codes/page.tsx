import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getQrCodes } from "@/lib/qr/dal";
import { getSiteUrl } from "@/lib/site-url";
import { QrCodeManager } from "@/components/qr/QrCodeManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "QR Codes | KingdomFlow",
};

export default async function QrCodesPage() {
  const membership = await requireOrganization();
  if (!membership.tabAccess.qrcodes.read) return <AccessRestricted label="QR Codes" />;

  const codes = await getQrCodes(membership.organization.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">QR Codes</h1>
        <p className="mt-1 text-muted-foreground">
          Make a QR code once, print it, and change where it goes any time. Send iPhone, Android and computer visitors to different places, shorten the link, style the code, and see how many scans it gets.
        </p>
      </div>

      <QrCodeManager
        codes={codes}
        siteUrl={getSiteUrl()}
        canWrite={membership.tabAccess.qrcodes.write}
        canDelete={membership.tabAccess.qrcodes.delete}
      />
    </div>
  );
}
