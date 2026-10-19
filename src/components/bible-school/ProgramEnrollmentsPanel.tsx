"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideProgramEnrollmentAction,
  enrollInProgramAction,
  type LmsResult,
} from "@/lib/lms/actions";
import type { MemberOption, ProgramEnrollmentRow } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// Who is enrolled in a program, and a way to enroll someone directly. Approving or enrolling a person
// enrolls them in every course of the program; withdrawing them takes those course enrollments away
// (progress is kept).
export function ProgramEnrollmentsPanel({
  organizationId,
  programId,
  programOpen,
  rows,
  members,
}: {
  organizationId: string;
  programId: string;
  programOpen: boolean;
  rows: ProgramEnrollmentRow[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [status, setStatus] = useState<"approved" | "pending">("approved");

  const matches = search.trim()
    ? members
        .filter((m) =>
          m.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

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

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      <Card>
        <CardContent className="space-y-3">
          <p className="font-medium">Enroll a member in this program</p>
          {!programOpen && (
            <p className="text-sm text-muted-foreground">
              Publish the program first. Only published programs take
              enrollments.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pe-search">Member</Label>
              <Input
                id="pe-search"
                placeholder="Search by name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setMemberId("");
                }}
              />
            </div>
            <select
              className={SELECT_CLASS}
              value={status}
              onChange={(e) => setStatus(e.target.value as "approved" | "pending")}
              aria-label="Start as"
            >
              <option value="approved">Approved now</option>
              <option value="pending">Pending</option>
            </select>
            <Button
              disabled={pending || !memberId || !programOpen}
              onClick={() =>
                run(
                  () =>
                    enrollInProgramAction(
                      organizationId,
                      programId,
                      memberId,
                      status,
                    ),
                  "Enrolled in the program and its courses.",
                )
              }
            >
              Enroll
            </Button>
          </div>
          {matches.length > 0 && !memberId && (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMemberId(m.id);
                    setSearch(m.name);
                  }}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nobody is enrolled in this program yet.
          </CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {row.studentName}
                  {row.isStudent && (
                    <Badge variant="outline" className="ml-2">
                      Student
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.studentPhone ? `${row.studentPhone} · ` : ""}
                  {row.coursesDone} of {row.coursesTotal} required courses done
                  · {row.source}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.status === "approved" || row.status === "active" ? "default" : "secondary"}>
                  {row.status}
                </Badge>
                {row.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          decideProgramEnrollmentAction(
                            organizationId,
                            row.id,
                            "approve",
                          ),
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          decideProgramEnrollmentAction(
                            organizationId,
                            row.id,
                            "reject",
                          ),
                        )
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
                {["pending", "approved", "active"].includes(row.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Withdraw ${row.studentName} from this program and its courses? Their progress is kept.`,
                        )
                      )
                        run(() =>
                          decideProgramEnrollmentAction(
                            organizationId,
                            row.id,
                            "withdraw",
                          ),
                        );
                    }}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
