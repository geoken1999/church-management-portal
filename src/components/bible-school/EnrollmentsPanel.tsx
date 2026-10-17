"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideEnrollmentAction,
  enrollStudentAction,
  type LmsResult,
} from "@/lib/lms/actions";
import { ENROLLMENT_LABELS, type EnrollmentAction } from "@/lib/lms/constants";
import { availableEnrollmentActions, progressPercent } from "@/lib/lms/rules";
import type { EnrollmentRow, MemberOption } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const ACTION_LABELS: Record<EnrollmentAction, string> = {
  approve: "Approve",
  reject: "Reject",
  activate: "Activate",
  withdraw: "Withdraw",
};

// The enrollment rows with their possible actions, and a form to enroll a student directly.
export function EnrollmentsPanel({
  organizationId,
  rows,
  courses,
  members,
  fixedCourseId,
  canManage,
}: {
  organizationId: string;
  rows: EnrollmentRow[];
  courses: { id: string; title: string; status: string }[];
  members: MemberOption[];
  /** Set on a course's own page: the course is not chosen again. */
  fixedCourseId?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [courseId, setCourseId] = useState(fixedCourseId ?? "");
  const [status, setStatus] = useState<"approved" | "pending">("approved");

  const matches = search.trim()
    ? members
        .filter((m) =>
          m.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function run(
    action: () => Promise<LmsResult>,
    done?: string,
    after?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        if (done) setNotice(done);
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      {canManage && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">Enroll a student</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px]">
              <div className="space-y-1.5">
                <Label htmlFor="enroll-student">Student (a member)</Label>
                <Input
                  id="enroll-student"
                  placeholder="Search members by name"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setMemberId("");
                  }}
                />
                {matches.length > 0 && !memberId && (
                  <div className="rounded-md border border-border">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setMemberId(m.id);
                          setSearch(m.name);
                        }}
                      >
                        {m.name}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enroll-course">Course</Label>
                <select
                  id="enroll-course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className={`${SELECT_CLASS} w-full`}
                  disabled={Boolean(fixedCourseId)}
                >
                  <option value="">Choose a course</option>
                  {courses
                    .filter(
                      (c) => c.status === "published" || c.id === fixedCourseId,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enroll-status">Enroll as</Label>
                <select
                  id="enroll-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "approved" | "pending")
                  }
                  className={`${SELECT_CLASS} w-full`}
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <Button
              disabled={pending || !memberId || !courseId}
              onClick={() =>
                run(
                  () =>
                    enrollStudentAction(
                      organizationId,
                      courseId,
                      memberId,
                      status,
                    ),
                  "Student enrolled.",
                  () => {
                    setSearch("");
                    setMemberId("");
                  },
                )
              }
            >
              Enroll
            </Button>
            <p className="text-xs text-muted-foreground">
              Only published courses can take enrollments. A direct enrollment
              ignores the enrollment dates but never the number of seats.
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No enrollments to show.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.studentName}</span>
                    <Badge
                      variant={
                        row.status === "pending"
                          ? "secondary"
                          : row.status === "rejected" ||
                              row.status === "withdrawn"
                            ? "outline"
                            : "default"
                      }
                    >
                      {ENROLLMENT_LABELS[row.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fixedCourseId ? "" : `${row.courseTitle} · `}
                    {row.source === "self"
                      ? "Asked to join"
                      : "Enrolled by an admin"}{" "}
                    on {new Date(row.requested_at).toLocaleDateString()}
                    {row.studentPhone ? ` · ${row.studentPhone}` : ""}
                    {row.requiredTotal > 0 &&
                    ["approved", "active", "completed"].includes(row.status)
                      ? ` · ${row.requiredDone}/${row.requiredTotal} required lessons (${progressPercent(row.requiredDone, row.requiredTotal)}%)`
                      : ""}
                  </p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableEnrollmentActions(row.status).map((action) => (
                      <Button
                        key={action}
                        size="sm"
                        variant={action === "approve" ? "default" : "outline"}
                        disabled={pending}
                        onClick={() => {
                          if (
                            action === "withdraw" &&
                            !confirm(
                              `Withdraw ${row.studentName} from ${row.courseTitle}?`,
                            )
                          )
                            return;
                          run(() =>
                            decideEnrollmentAction(
                              organizationId,
                              row.id,
                              action,
                            ),
                          );
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
