import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { SUPPORT_GUIDE_CATEGORIES } from "@/lib/platform-admin/support-guide-content";
import { DocumentationBrowser } from "@/components/docs/DocumentationBrowser";

export const metadata: Metadata = {
  title: "Docs | KingdomFlow Super Admin",
};

export default async function PlatformAdminDocsPage() {
  await requirePlatformAdmin();

  return (
    <div className="space-y-8">
      <DocumentationBrowser
        categories={SUPPORT_GUIDE_CATEGORIES}
        heroTitle="Support & Ops Guide"
        heroDescription="Internal runbook for operating and supporting KingdomFlow — architecture, admin tools, scheduled jobs, and troubleshooting playbooks."
        searchPlaceholder="Search the runbook..."
        emptyStateTemplate='No entries match "{query}". Try a different search.'
      />
    </div>
  );
}
