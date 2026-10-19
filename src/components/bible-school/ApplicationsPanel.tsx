"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveApplicationAction,
  rejectApplicationAction,
  removeStudentAction,
} from "@/lib/lms/student-actions";
import type { LmsResult } from "@/lib/lms/actions";
import type { ApplicationRow, StudentRow } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function ApplicationsPanel({
  organizationId,
  publicUrl,
  applications,
  students,
  targets,
}: {
  organizationId: string;
  publicUrl: string;
  applications: ApplicationRow[];
  students: StudentRow[];
  targets: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  function run(action: () => Promise<LmsResult>, done?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        if (done) setNotice(done);
        router.refresh();
      }
    });
  }

  const waiting = applications.filter((a) => a.status === "pending");
  const decided = applications.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      <Card>
        <CardContent className="space-y-2">
          <p className="font-medium">Your public Bible School page</p>
          <p className="text-sm text-muted-foreground">
            People outside your church apply here. Set a program&apos;s
            visibility to <strong>Open to the public</strong> to list it on this
            page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-xs">
              {publicUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-heading text-xl font-bold">
          Waiting for review ({waiting.length})
        </h2>
        {waiting.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No applications waiting.
            </CardContent>
          </Card>
        )}
        {waiting.map((application) => {
          const course =
            choice[application.id] ??
            (application.program_id
              ? `program:${application.program_id}`
              : application.course_id
                ? `course:${application.course_id}`
                : "");
          return (
            <Card key={application.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {application.first_name} {application.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {application.phone}
                      {application.email ? ` · ${application.email}` : ""} ·
                      applied{" "}
                      {new Date(application.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {application.payment_status === "awaiting" && (
                      <Badge variant="secondary">Waiting for payment</Badge>
                    )}
                    {(application.programTitle || application.courseTitle) && (
                      <Badge variant="outline">
                        Asked for:{" "}
                        {application.programTitle ?? application.courseTitle}
                      </Badge>
                    )}
                  </div>
                </div>
                {application.message && (
                  <p className="rounded-md bg-muted/50 p-2 text-sm">
                    &ldquo;{application.message}&rdquo;
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={course}
                    onChange={(e) =>
                      setChoice((c) => ({
                        ...c,
                        [application.id]: e.target.value,
                      }))
                    }
                    className={SELECT_CLASS}
                    aria-label="Enroll in"
                  >
                    <option value="">Approve without a program</option>
                    {targets.map((t) => (
                      <option key={t.value} value={t.value}>
                        Enroll in {t.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={pending || application.payment_status === "awaiting"}
                    onClick={() =>
                      run(
                        () =>
                          approveApplicationAction(
                            organizationId,
                            application.id,
                            course,
                          ),
                        "Approved. They can now sign in to the app with their number.",
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Input
                    className="max-w-xs"
                    placeholder="Reason, if declining (optional)"
                    value={note[application.id] ?? ""}
                    onChange={(e) =>
                      setNote((n) => ({
                        ...n,
                        [application.id]: e.target.value,
                      }))
                    }
                    maxLength={300}
                  />
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        rejectApplicationAction(
                          organizationId,
                          application.id,
                          note[application.id] ?? "",
                        ),
                      )
                    }
                  >
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="font-heading text-xl font-bold">
          Students ({students.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          People from outside the church who study here. They sign in to the app
          with their phone number, see only the Bible School, and don&apos;t
          appear in your members, messages or fees.
        </p>
        {students.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No students yet.
            </CardContent>
          </Card>
        )}
        {students.map((student) => (
          <Card key={student.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{student.name}</p>
                <p className="text-xs text-muted-foreground">
                  {student.phone ?? "No phone"} · {student.courses}{" "}
                  {student.courses === 1 ? "course" : "courses"} ·{" "}
                  {student.signedIn ? "has signed in" : "hasn't signed in yet"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${student.name}'s access? They can no longer sign in to the Bible School.`,
                    )
                  )
                    run(
                      () => removeStudentAction(organizationId, student.id),
                      "Access removed.",
                    );
                }}
              >
                Remove access
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {decided.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Recently decided
          </p>
          {decided.map((application) => (
            <p key={application.id} className="text-sm text-muted-foreground">
              {application.first_name} {application.last_name} ·{" "}
              {application.status === "approved" ? "Approved" : "Declined"}
              {application.decided_at
                ? ` · ${new Date(application.decided_at).toLocaleDateString()}`
                : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
