import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getApplications, getCourseOptions, getPrograms, getStudents } from "@/lib/lms/dal";
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
  const [applications, students, courses, programs] = await Promise.all([
    getApplications(organizationId),
    getStudents(organizationId),
    getCourseOptions(organizationId),
    getPrograms(organizationId),
  ]);
  // A program, or a course that belongs to no program.
  const inProgram = new Set(programs.flatMap((p) => p.courseIds));
  const targets = [
    ...programs
      .filter((p) => p.status === "published")
      .map((p) => ({ value: `program:${p.id}`, label: p.title })),
    ...courses
      .filter((c) => c.status === "published" && !inProgram.has(c.id))
      .map((c) => ({ value: `course:${c.id}`, label: c.title })),
  ];
  return (
    <ApplicationsPanel
      organizationId={organizationId}
      publicUrl={`${getSiteUrl()}${publicSchoolPath(membership.organization.slug)}`}
      applications={applications}
      students={students}
      targets={targets}
    />
  );
}
