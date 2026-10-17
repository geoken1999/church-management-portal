import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getApplications, getCourseOptions, getStudents } from "@/lib/lms/dal";
import { publicSchoolPath } from "@/lib/lms/students";
import { getSiteUrl } from "@/lib/site-url";
import { ApplicationsPanel } from "@/components/bible-school/ApplicationsPanel";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Applications | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  if (!membership.tabAccess.bibleschool.write) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Only school administrators can review applications.
        </CardContent>
      </Card>
    );
  }
  const [applications, students, courses] = await Promise.all([
    getApplications(organizationId),
    getStudents(organizationId),
    getCourseOptions(organizationId),
  ]);
  return (
    <ApplicationsPanel
      organizationId={organizationId}
      publicUrl={`${getSiteUrl()}${publicSchoolPath(membership.organization.slug)}`}
      applications={applications}
      students={students}
      courses={courses
        .filter((c) => c.status === "published")
        .map((c) => ({ id: c.id, title: c.title }))}
    />
  );
}
