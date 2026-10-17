import type { ReactNode } from "react";
import { requireOrganization } from "@/lib/organizations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { BibleSchoolTabs } from "@/components/bible-school/BibleSchoolTabs";

export default async function BibleSchoolLayout({
  children,
}: {
  children: ReactNode;
}) {
  const membership = await requireOrganization();
  const access = membership.tabAccess.bibleschool;
  if (!access.read) return <AccessRestricted label="Bible School" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Bible School
        </h1>
        <p className="mt-1 text-muted-foreground">
          Programs, courses, curriculum and students for{" "}
          {membership.organization.name}.
        </p>
      </div>
      <BibleSchoolTabs canManageSchool={access.write} />
      {children}
    </div>
  );
}
