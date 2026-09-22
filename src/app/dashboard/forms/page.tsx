import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getForms } from "@/lib/forms/dal";
import { FormsManager } from "@/components/forms/FormsManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Forms | KingdomFlow",
};

export default async function FormsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.forms.read) {
    return <AccessRestricted label="Forms" />;
  }

  const forms = await getForms(organizationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Forms</h1>
        <p className="mt-1 text-muted-foreground">
          Build registration forms and surveys you can share with a link, and see the responses come in.
        </p>
      </div>

      <FormsManager
        organizationId={organizationId}
        forms={forms}
        canWrite={membership.tabAccess.forms.write}
        canDelete={membership.tabAccess.forms.delete}
      />
    </div>
  );
}
