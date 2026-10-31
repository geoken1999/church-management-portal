import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getCategories, listAllTemplatesForAdmin } from "@/lib/designer/templates-dal";
import { TemplateAdmin } from "@/components/platform-admin/TemplateAdmin";

export const metadata: Metadata = { title: "Design templates | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function DesignTemplatesAdminPage() {
  await requirePlatformAdmin();
  const [categories, templates] = await Promise.all([getCategories(), listAllTemplatesForAdmin()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Design templates</h1>
        <p className="mt-1 text-muted-foreground">The template library every church sees in Design Studio. Unpublished templates are hidden from churches.</p>
      </div>
      <TemplateAdmin categories={categories} templates={templates} />
    </div>
  );
}
