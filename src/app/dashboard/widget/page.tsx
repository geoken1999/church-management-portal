import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getWidget, getWidgetSubmissions } from "@/lib/widget/dal";
import { getSiteUrl } from "@/lib/site-url";
import { WidgetManager } from "@/components/widget/WidgetManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Widget | KingdomFlow",
};

export default async function WidgetPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.widget.read) {
    return <AccessRestricted label="Widget" />;
  }

  const widget = await getWidget(organizationId);
  const submissions = widget ? await getWidgetSubmissions(widget.id) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Widget</h1>
        <p className="mt-1 text-muted-foreground">
          Design an embeddable widget for your website to capture visitor queries.
        </p>
      </div>

      <WidgetManager
        organizationId={organizationId}
        siteUrl={getSiteUrl()}
        widget={widget}
        submissions={submissions}
        canWrite={membership.tabAccess.widget.write}
        canDelete={membership.tabAccess.widget.delete}
      />
    </div>
  );
}
