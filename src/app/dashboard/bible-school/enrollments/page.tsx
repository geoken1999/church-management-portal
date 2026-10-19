import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import {
  getCourseOptions,
  getEnrollments,
  getMemberOptions,
  getPendingProgramRequests,
  getTaughtCourseIds,
} from "@/lib/lms/dal";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { ProgramRequestsPanel } from "@/components/bible-school/ProgramRequestsPanel";
import { EnrollmentsPanel } from "@/components/bible-school/EnrollmentsPanel";
import { EnrollmentFilters } from "@/components/bible-school/EnrollmentFilters";
import { Pager } from "@/components/bible-school/Pager";

export const metadata: Metadata = {
  title: "Enrollments | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; status?: string; page?: string }>;
}) {
  const { course = "", status = "", page = "1" } = await searchParams;
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const canManageSchool = membership.tabAccess.bibleschool.write;

  const onlyCourseIds = canManageSchool
    ? undefined
    : await getTaughtCourseIds(organizationId, user.id);
  const [result, courses, members, programRequests] = await Promise.all([
    getEnrollments(organizationId, {
      courseId: course || undefined,
      status,
      page: Number(page) || 1,
      onlyCourseIds,
    }),
    getCourseOptions(organizationId),
    canManageSchool ? getMemberOptions(organizationId) : Promise.resolve([]),
    canManageSchool
      ? getPendingProgramRequests(organizationId)
      : Promise.resolve([]),
  ]);
  const visibleCourses = onlyCourseIds
    ? courses.filter((c) => onlyCourseIds.includes(c.id))
    : courses;

  return (
    <div className="space-y-4">
      <ProgramRequestsPanel
        organizationId={organizationId}
        requests={programRequests}
      />
      <EnrollmentFilters
        courseId={course}
        status={status}
        courses={visibleCourses.map((c) => ({ id: c.id, title: c.title }))}
      />
      <EnrollmentsPanel
        organizationId={organizationId}
        rows={result.rows}
        courses={visibleCourses}
        members={members}
        canManage={canManageSchool}
      />
      <Pager
        basePath={`${LMS_BASE_PATH}/enrollments`}
        params={{ course, status }}
        page={result.page}
        pageCount={result.pageCount}
      />
    </div>
  );
}
