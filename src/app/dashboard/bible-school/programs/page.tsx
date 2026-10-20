import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { publicSchoolPath } from "@/lib/lms/students";
import { requireOrganization } from "@/lib/organizations/dal";
import { getCourseOptions, getPrograms } from "@/lib/lms/dal";
import { ProgramsManager } from "@/components/bible-school/ProgramsManager";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Programs | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  if (!membership.tabAccess.bibleschool.write) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Only school administrators can manage programs.
        </CardContent>
      </Card>
    );
  }
  const [programs, courses] = await Promise.all([
    getPrograms(organizationId),
    getCourseOptions(organizationId),
  ]);
  return (
    <ProgramsManager
      organizationId={organizationId}
      programs={programs}
      courses={courses}
      canDelete={membership.tabAccess.bibleschool.delete}
      publicBaseUrl={`${getSiteUrl()}${publicSchoolPath(membership.organization.slug)}`}
    />
  );
}
