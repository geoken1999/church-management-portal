import type { Metadata } from "next";
import { TRASH_DAYS, getTrashedDesigns } from "@/lib/designer/dal";
import { requireStudio } from "@/lib/designer/guard";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { TrashList } from "@/components/designer/TrashList";

export const metadata: Metadata = { title: "Trash | KingdomFlow" };

export default async function TrashPage() {
  const { membership, allowed } = await requireStudio();
  if (!allowed) return <AccessRestricted label="Design Studio" />;
  const designs = await getTrashedDesigns(membership.organization.id);
  return <TrashList designs={designs} organizationId={membership.organization.id} canWrite={membership.tabAccess.designer.write} canDelete={membership.tabAccess.designer.delete} days={TRASH_DAYS} />;
}
