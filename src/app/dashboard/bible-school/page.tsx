import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import {
  getOverview,
  getPendingProgramRequests,
  getTaughtCourseIds,
} from "@/lib/lms/dal";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <Card
      className={href ? "transition-colors hover:border-primary" : undefined}
    >
      <CardContent>
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="font-heading text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function BibleSchoolOverviewPage() {
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const canManageSchool = membership.tabAccess.bibleschool.write;

  // An instructor sees numbers for the courses they teach; whoever manages the school sees all of it.
  const taught = canManageSchool
    ? undefined
    : await getTaughtCourseIds(organizationId, user.id);
  const overview = await getOverview(organizationId, taught);
  const programRequests = canManageSchool
    ? (await getPendingProgramRequests(organizationId)).length
    : 0;
  const totalCourses =
    overview.courses.draft +
    overview.courses.published +
    overview.courses.archived;

  return (
    <div className="space-y-6">
      {!canManageSchool && taught?.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            You aren&apos;t assigned to teach any course yet. Ask a school
            administrator to add you as an instructor.
          </CardContent>
        </Card>
      )}

      {programRequests > 0 && (
        <Link href={`${LMS_BASE_PATH}/enrollments`}>
          <Card className="border-primary/50 transition-colors hover:border-primary">
            <CardContent className="text-sm">
              <strong>{programRequests}</strong> program request
              {programRequests === 1 ? "" : "s"} from members waiting for you.
              Open Enrollments to approve.
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Published courses"
          value={overview.courses.published}
          href={`${LMS_BASE_PATH}/courses?status=published`}
        />
        <Stat
          label="Draft courses"
          value={overview.courses.draft}
          href={`${LMS_BASE_PATH}/courses?status=draft`}
        />
        <Stat
          label="Students enrolled"
          value={overview.enrollments.approved + overview.enrollments.active}
          href={`${LMS_BASE_PATH}/enrollments`}
        />
        <Stat
          label="Pending requests"
          value={overview.enrollments.pending}
          href={`${LMS_BASE_PATH}/enrollments?status=pending`}
        />
        {canManageSchool && (
          <Stat
            label="Published programs"
            value={overview.programs.published}
            href={`${LMS_BASE_PATH}/programs`}
          />
        )}
        <Stat label="Instructors assigned" value={overview.instructors} />
        <Stat
          label="Completed enrollments"
          value={overview.enrollments.completed}
        />
        <Stat label="Total courses" value={totalCourses} />
      </div>

      {canManageSchool && totalCourses === 0 && (
        <Card>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">Get started</p>
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
              <li>
                Create a course under{" "}
                <Link
                  className="text-primary underline"
                  href={`${LMS_BASE_PATH}/courses`}
                >
                  Courses
                </Link>
                .
              </li>
              <li>
                Add modules and lessons in its Curriculum tab, and publish them.
              </li>
              <li>Assign an instructor, then publish the course.</li>
              <li>
                Enroll students from{" "}
                <Link
                  className="text-primary underline"
                  href={`${LMS_BASE_PATH}/enrollments`}
                >
                  Enrollments
                </Link>
                .
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
