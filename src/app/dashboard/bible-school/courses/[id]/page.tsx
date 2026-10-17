import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCourse,
  getCourseOptions,
  getCurriculum,
  getEnrollments,
  getInstructors,
  getSessions,
  getMemberOptions,
  getPrerequisites,
  getTeamLogins,
} from "@/lib/lms/dal";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { canManageCourse } from "@/lib/lms/rules";
import { CourseDetailsPanel } from "@/components/bible-school/CourseDetailsPanel";
import { CurriculumBuilder } from "@/components/bible-school/CurriculumBuilder";
import { InstructorsPanel } from "@/components/bible-school/InstructorsPanel";
import { EnrollmentsPanel } from "@/components/bible-school/EnrollmentsPanel";
import { LiveClassesPanel } from "@/components/bible-school/LiveClassesPanel";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Course | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

const TABS = [
  { key: "curriculum", label: "Curriculum" },
  { key: "details", label: "Details" },
  { key: "instructors", label: "Instructors" },
  { key: "enrollments", label: "Enrollments" },
  { key: "live", label: "Live classes" },
] as const;

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const canManageSchool = membership.tabAccess.bibleschool.write;

  const course = await getCourse(organizationId, id);
  if (!course) notFound();

  // Someone without school-wide write access must be an instructor of this very course.
  const { data: assignment } = await createAdminClient()
    .from("lms_course_instructors")
    .select("id")
    .eq("course_id", id)
    .eq("organization_id", organizationId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const canEditCurriculum = canManageCourse({
    isAdmin: false,
    canWrite: canManageSchool,
    isAssignedInstructor: Boolean(assignment),
  });
  if (!canEditCurriculum) notFound();

  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "curriculum";
  const base = `${LMS_BASE_PATH}/courses/${id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`${LMS_BASE_PATH}/courses`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All courses
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            {course.title}
          </h2>
          {course.code && <Badge variant="outline">{course.code}</Badge>}
          <Badge
            variant={course.status === "published" ? "default" : "secondary"}
          >
            {course.status}
          </Badge>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "curriculum" && (
        <CurriculumBuilder
          organizationId={organizationId}
          courseId={id}
          modules={await getCurriculum(organizationId, id)}
        />
      )}

      {tab === "details" &&
        (canManageSchool ? (
          <CourseDetailsPanel
            organizationId={organizationId}
            course={course}
            prerequisiteOptions={(
              await getCourseOptions(organizationId)
            ).filter((c) => c.id !== id)}
            selectedPrerequisites={await getPrerequisites(organizationId, id)}
            canDelete={membership.tabAccess.bibleschool.delete}
          />
        ) : (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              Only school administrators can change a course&apos;s details,
              publish it, or manage its roster.
            </CardContent>
          </Card>
        ))}

      {tab === "instructors" && (
        <InstructorsPanel
          organizationId={organizationId}
          courseId={id}
          instructors={await getInstructors(organizationId, id)}
          members={
            canManageSchool ? await getMemberOptions(organizationId) : []
          }
          logins={canManageSchool ? await getTeamLogins(organizationId) : []}
          canManage={canManageSchool}
        />
      )}

      {tab === "live" && (
        <LiveClassesPanel
          organizationId={organizationId}
          courseId={id}
          sessions={await getSessions(organizationId, { courseId: id })}
          timeZone={membership.organization.timezone || DEFAULT_TIMEZONE}
          canSchedule={canEditCurriculum}
        />
      )}

      {tab === "enrollments" && (
        <EnrollmentsPanel
          organizationId={organizationId}
          rows={(await getEnrollments(organizationId, { courseId: id })).rows}
          courses={[
            { id: course.id, title: course.title, status: course.status },
          ]}
          members={
            canManageSchool ? await getMemberOptions(organizationId) : []
          }
          fixedCourseId={id}
          canManage={canManageSchool}
        />
      )}
    </div>
  );
}
