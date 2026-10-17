import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import { getCourses, getLmsSettings, getTaughtCourseIds } from "@/lib/lms/dal";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { NewCourse } from "@/components/bible-school/NewCourse";
import { CourseFilters } from "@/components/bible-school/CourseFilters";
import { Pager } from "@/components/bible-school/Pager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Courses | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q = "", status = "", page = "1" } = await searchParams;
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const canManageSchool = membership.tabAccess.bibleschool.write;

  const onlyIds = canManageSchool
    ? undefined
    : await getTaughtCourseIds(organizationId, user.id);
  const [result, settings] = await Promise.all([
    getCourses(organizationId, { q, status, page: Number(page) || 1, onlyIds }),
    getLmsSettings(organizationId),
  ]);

  return (
    <div className="space-y-4">
      {canManageSchool && (
        <NewCourse
          organizationId={organizationId}
          defaultLanguage={settings.default_language}
        />
      )}
      <CourseFilters q={q} status={status} />

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q || status
              ? "No courses match these filters."
              : canManageSchool
                ? "No courses yet. Create your first one above."
                : "You aren't assigned to any course yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {result.rows.map((course) => (
            <Link
              key={course.id}
              href={`${LMS_BASE_PATH}/courses/${course.id}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{course.title}</span>
                      {course.code && (
                        <Badge variant="outline">{course.code}</Badge>
                      )}
                      <Badge
                        variant={
                          course.status === "published"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {course.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.instructorNames.length > 0
                        ? course.instructorNames.join(", ")
                        : "No instructor yet"}{" "}
                      · {course.enrolled} enrolled
                      {course.capacity ? ` of ${course.capacity}` : ""}
                      {course.pending > 0 ? ` · ${course.pending} pending` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pager
        basePath={`${LMS_BASE_PATH}/courses`}
        params={{ q, status }}
        page={result.page}
        pageCount={result.pageCount}
      />
    </div>
  );
}
