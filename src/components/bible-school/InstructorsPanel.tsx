"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addInstructorAction,
  removeInstructorAction,
  type LmsResult,
} from "@/lib/lms/actions";
import type { InstructorRow, MemberOption } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function InstructorsPanel({
  organizationId,
  courseId,
  instructors,
  members,
  logins,
  canManage,
}: {
  organizationId: string;
  courseId: string;
  instructors: InstructorRow[];
  members: MemberOption[];
  logins: { authUserId: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState("lead");

  const matches = search.trim()
    ? members
        .filter((m) =>
          m.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function run(action: () => Promise<LmsResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action().catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {instructors.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No instructor yet.
          </CardContent>
        </Card>
      ) : (
        instructors.map((instructor) => (
          <Card key={instructor.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{instructor.name}</span>
                  <Badge variant="outline">{instructor.role}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {instructor.loginName
                    ? `Can teach from the dashboard as ${instructor.loginName}`
                    : "No dashboard login linked"}
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      removeInstructorAction(organizationId, instructor.id),
                    )
                  }
                >
                  Remove
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {canManage && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">Add an instructor</p>
            <div className="space-y-1.5">
              <Label htmlFor="instructor-search">Member</Label>
              <Input
                id="instructor-search"
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="instructor-login">
                  Dashboard login (so they can edit the curriculum)
                </Label>
                <select
                  id="instructor-login"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">None</option>
                  {logins.map((l) => (
                    <option key={l.authUserId} value={l.authUserId}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instructor-role">Role</Label>
                <select
                  id="instructor-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="lead">Lead instructor</option>
                  <option value="assistant">Assistant</option>
                </select>
              </div>
            </div>
            <Button
              disabled={pending || !memberId}
              onClick={() =>
                run(
                  () =>
                    addInstructorAction(
                      organizationId,
                      courseId,
                      memberId,
                      loginId,
                      role,
                    ),
                  () => {
                    setSearch("");
                    setMemberId("");
                    setLoginId("");
                  },
                )
              }
            >
              Add instructor
            </Button>
            <p className="text-xs text-muted-foreground">
              A linked dashboard login needs read access on the Bible School tab
              (Team page). It can then edit this course&apos;s curriculum and
              see its roster, and nothing else.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
