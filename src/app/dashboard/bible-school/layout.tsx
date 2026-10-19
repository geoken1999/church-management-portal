import type { ReactNode } from "react";
import { requireOrganization } from "@/lib/organizations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { getBibleSchoolAccess } from "@/lib/lms/access";
import { BibleSchoolLocked } from "@/components/bible-school/BibleSchoolLocked";
import { BibleSchoolTabs } from "@/components/bible-school/BibleSchoolTabs";

export default async function BibleSchoolLayout({
  children,
}: {
  children: ReactNode;
}) {
  const membership = await requireOrganization();
  const access = membership.tabAccess.bibleschool;
  if (!access.read) return <AccessRestricted label="Bible School" />;

  const school = await getBibleSchoolAccess(membership.organization.id);
  if (!school.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Bible School
        </h1>
        <BibleSchoolLocked
          requestedAt={school.requestedAt}
          canRequest={
            membership.role === "owner" || membership.role === "admin"
          }
        />
      </div>
    );
  }

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
