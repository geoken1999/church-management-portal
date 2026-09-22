import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { DocumentationBrowser } from "@/components/docs/DocumentationBrowser";

export const metadata: Metadata = {
  title: "Documentation | KingdomFlow",
};

export default async function DocumentationPage() {
  await requireOrganization();

  return (
    <div className="space-y-8">
      <DocumentationBrowser />
    </div>
  );
}
