import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { MobileSectionTabs } from "@/components/mobile/MobileSectionTabs";

// Owner/admin only, for every page under /dashboard/mobile.
export default async function MobileSectionLayout({ children }: { children: ReactNode }) {
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <MobileSectionTabs />
      {children}
    </div>
  );
}
