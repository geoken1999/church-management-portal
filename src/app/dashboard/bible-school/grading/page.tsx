import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import {
  getCourseOptions,
  getGradebook,
  getTaughtCourseIds,
  getWaitingAttempts,
} from "@/lib/lms/dal";
import { gradeLetter } from "@/lib/lms/quiz";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import {
  getMarkedSubmissions,
  getWaitingSubmissions,
} from "@/lib/lms/assignment-dal";
import { SubmissionsPanel } from "@/components/bible-school/SubmissionsPanel";
import { GradingPanel } from "@/components/bible-school/GradingPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Grading | Bible School | KingdomFlow",
};
export const dynamic = "force-dynamic";

// Written quiz answers waiting for a mark, and the gradebook: every student of a course against every quiz.
export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { course = "" } = await searchParams;
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const onlyCourseIds = membership.tabAccess.bibleschool.write
    ? undefined
    : await getTaughtCourseIds(organizationId, user.id);
  const [waiting, courses, waitingWork, markedWork] = await Promise.all([
    getWaitingAttempts(organizationId, onlyCourseIds),
    getCourseOptions(organizationId),
    getWaitingSubmissions(organizationId, onlyCourseIds),
    getMarkedSubmissions(organizationId, onlyCourseIds),
  ]);
  const visible = onlyCourseIds
    ? courses.filter((c) => onlyCourseIds.includes(c.id))
    : courses;
  const chosen = visible.find((c) => c.id === course) ?? visible[0];
  const book = chosen ? await getGradebook(organizationId, chosen.id) : null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold">
            Waiting to be marked ({waiting.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Quizzes with written answers. The student sees their result once you
            save the marks.
          </p>
        </div>
        <GradingPanel organizationId={organizationId} attempts={waiting} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold">
            Assignments waiting to be marked ({waitingWork.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Typed answers and files students have handed in. They are told when
            you save the mark.
          </p>
        </div>
        <SubmissionsPanel
          organizationId={organizationId}
          waiting={waitingWork}
          marked={markedWork}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold">Gradebook</h2>
          <p className="text-sm text-muted-foreground">
            The best result each student has had on each quiz, and their
            average.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`${LMS_BASE_PATH}/grading?course=${c.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${chosen?.id === c.id ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {c.title}
            </Link>
          ))}
        </div>
        {!book || book.quizzes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {chosen ? "This course has no quizzes yet." : "No courses yet."}
            </CardContent>
          </Card>
        ) : book.rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nobody is enrolled in this course yet.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  {book.quizzes.map((q) => (
                    <th key={q.id} className="px-3 py-2">
                      {q.title}
                      <span className="block font-normal normal-case">
                        pass {q.passPercent}%
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2">Average</th>
                </tr>
              </thead>
              <tbody>
                {book.rows.map((row) => (
                  <tr key={row.memberId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.enrollment}
                      </p>
                    </td>
                    {book.quizzes.map((q) => {
                      const r = row.quizzes[q.id];
                      return (
                        <td key={q.id} className="px-3 py-2">
                          {r.waiting ? (
                            <Badge variant="secondary">waiting</Badge>
                          ) : r.percent === null ? (
                            <span className="text-muted-foreground">–</span>
                          ) : (
                            <span
                              className={
                                r.passed ? "font-medium text-primary" : ""
                              }
                            >
                              {r.percent}% {r.passed ? "✓" : ""}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({r.attempts})
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-medium">
                      {row.overall === null
                        ? "–"
                        : `${row.overall}% ${gradeLetter(row.overall)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
