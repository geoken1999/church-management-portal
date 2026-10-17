import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLmsSettings } from "@/lib/lms/dal";
import { SettingsForm } from "@/components/bible-school/SettingsForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Settings | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  if (!membership.tabAccess.bibleschool.write) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Only school administrators can change the Bible School settings.
        </CardContent>
      </Card>
    );
  }
  return (
    <SettingsForm
      organizationId={organizationId}
      settings={await getLmsSettings(organizationId)}
    />
  );
}
