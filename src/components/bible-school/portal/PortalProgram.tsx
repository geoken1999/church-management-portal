"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  portal,
  portalError,
  type PProgram,
  type PProgramCourse,
} from "@/lib/lms/portal-client";
import { usePortal } from "@/components/bible-school/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// A program: what it holds and costs. Joining, and paying, happen here, once, for the whole program.
export function PortalProgram({ programId }: { programId: string }) {
  const { identity } = usePortal();
  const [program, setProgram] = useState<PProgram | null | undefined>(
    undefined,
  );
  const [courses, setCourses] = useState<PProgramCourse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [programs, list] = await Promise.all([
        portal.programs(identity.organizationId),
        portal.programCourses(programId),
      ]);
      setProgram(programs.find((p) => p.program_id === programId) ?? null);
      setCourses(list);
    } catch (e) {
      setError(portalError(e, "Couldn't load this program."));
      setProgram(null);
    }
  }, [identity.organizationId, programId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function join() {
    if (!program) return;
    setBusy(true);
    setError(null);
    try {
      if ((program.price_amount ?? 0) > 0) {
        window.location.assign(await portal.checkoutUrl(programId));
        return;
      }
      const status = await portal.requestProgram(programId);
      setNotice(
        status === "pending"
          ? "Request sent. You will be told when it is approved."
          : "You have joined the program.",
      );
      await load();
    } catch (e) {
      setError(portalError(e));
    } finally {
      setBusy(false);
    }
  }

  if (program === undefined)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (program === null)
    return (
      <div className="space-y-3">
        <p className="text-sm">{error ?? "That program isn't available."}</p>
        <Link
          href="/bible-school/learn"
          className="text-sm font-medium text-primary underline"
        >
          Back
        </Link>
      </div>
    );

  const status = program.my_status;
  const joined =
    status === "approved" || status === "active" || status === "completed";
  const paid = (program.price_amount ?? 0) > 0;
  const full =
    program.capacity !== null && program.seats_taken >= program.capacity;

  return (
    <div className="space-y-6">
      <Link
        href="/bible-school/learn"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{program.title}</h1>
        {program.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {program.description}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {program.course_count} courses · {program.lesson_count} lessons
        </p>
      </div>
      {program.objectives && (
        <div>
          <h2 className="font-heading text-base font-bold">
            What you will learn
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {program.objectives}
          </p>
        </div>
      )}

      {notice && (
        <p className="rounded-md bg-primary/10 p-3 text-sm">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "pending" ? (
        <Card>
          <CardContent className="text-sm">
            Your request is waiting for approval.
          </CardContent>
        </Card>
      ) : joined ? (
        <p className="text-sm font-medium text-primary">
          {status === "completed"
            ? "You completed this program."
            : "You are enrolled. Open a course below."}
        </p>
      ) : (
        <div className="space-y-2">
          {paid && (
            <p className="text-lg font-semibold">₹{program.price_amount}</p>
          )}
          {program.capacity !== null && !full && (
            <p className="text-sm">
              {Math.max(0, program.capacity - program.seats_taken)} seats left
            </p>
          )}
          <Button type="button" disabled={busy || full} onClick={join}>
            {busy
              ? "Please wait..."
              : paid
                ? `Pay ₹${program.price_amount} and join`
                : "Join this program"}
          </Button>
          {full && (
            <p className="text-xs text-muted-foreground">
              This program is full
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Joining the program enrolls you in every course below.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-heading text-base font-bold">
          Courses in this program
        </h2>
        {courses.map((c, i) => {
          const body = (
            <Card
              className={joined ? "transition-colors hover:bg-muted/40" : ""}
            >
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {i + 1}. {c.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.lesson_count} lessons{c.is_required ? "" : " · optional"}
                  </p>
                </div>
                {c.my_status === "completed" && <Badge>Completed</Badge>}
              </CardContent>
            </Card>
          );
          return joined ? (
            <Link
              key={c.course_id}
              href={`/bible-school/learn/course/${c.course_id}`}
              className="block"
            >
              {body}
            </Link>
          ) : (
            <div key={c.course_id}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
