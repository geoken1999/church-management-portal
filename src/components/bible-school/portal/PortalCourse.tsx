"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Play } from "lucide-react";
import {
  portal,
  portalError,
  type PCourse,
  type PMyCourse,
  type POutlineItem,
} from "@/lib/lms/portal-client";
import { usePortal } from "@/components/bible-school/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function PortalCourse({ courseId }: { courseId: string }) {
  const { identity } = usePortal();
  const [course, setCourse] = useState<PCourse | null | undefined>(undefined);
  const [mine, setMine] = useState<PMyCourse | null>(null);
  const [outline, setOutline] = useState<POutlineItem[]>([]);
  const [program, setProgram] = useState<{
    program_id: string;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [catalog, my, lessons] = await Promise.all([
        portal.catalog(identity.organizationId),
        portal.myCourses(identity.organizationId),
        portal.outline(courseId),
      ]);
      setCourse(catalog.find((c) => c.course_id === courseId) ?? null);
      setMine(my.find((c) => c.course_id === courseId) ?? null);
      setOutline(lessons);
      setProgram((await portal.courseProgram(courseId))[0] ?? null);
    } catch (e) {
      setError(portalError(e, "Couldn't load this course."));
      setCourse(null);
    }
  }, [identity.organizationId, courseId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function join() {
    if (!course) return;
    setBusy(true);
    setError(null);
    try {
      const status = await portal.request(courseId);
      setNotice(
        status === "pending"
          ? "Request sent. You will be told when it is approved."
          : "You have joined the course.",
      );
      await load();
    } catch (e) {
      setError(portalError(e));
    } finally {
      setBusy(false);
    }
  }

  if (course === undefined)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (course === null)
    return (
      <div className="space-y-3">
        <p className="text-sm">{error ?? "That course isn't available."}</p>
        <Link
          href="/bible-school/learn"
          className="text-sm font-medium text-primary underline"
        >
          Back to my courses
        </Link>
      </div>
    );

  const status = mine?.status ?? course.my_status;
  const joined =
    status === "approved" || status === "active" || status === "completed";
  let blocker: string | null = null;
  if (!course.prerequisites_met)
    blocker = `Finish first: ${course.missing_prerequisites ?? "the prerequisite courses"}`;
  else if (
    course.enrollment_opens_at &&
    now < new Date(course.enrollment_opens_at).getTime()
  )
    blocker = `Enrollment opens on ${new Date(course.enrollment_opens_at).toLocaleDateString()}`;
  else if (
    course.enrollment_closes_at &&
    now > new Date(course.enrollment_closes_at).getTime()
  )
    blocker = "Enrollment has closed";
  else if (course.capacity !== null && course.seats_taken >= course.capacity)
    blocker = "This course is full";

  const modules = outline.reduce<Record<string, POutlineItem[]>>(
    (acc, item) => {
      (acc[item.module_title + "|" + item.module_id] ??= []).push(item);
      return acc;
    },
    {},
  );
  const firstOpen =
    outline.find((l) => !l.locked && !l.completed) ??
    outline.find((l) => !l.locked);
  const pct =
    status === "completed"
      ? 100
      : mine && mine.required_total
        ? Math.round((mine.required_done / mine.required_total) * 100)
        : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/bible-school/learn"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← My courses
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{course.title}</h1>
        {course.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {course.lesson_count} lessons
          {course.instructors ? ` · ${course.instructors}` : ""}
        </p>
      </div>

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
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {status === "completed"
              ? "Course completed"
              : `${mine?.required_done ?? 0} of ${mine?.required_total ?? 0} required lessons done`}
          </p>
          {firstOpen && (
            <Link href={`/bible-school/learn/lesson/${firstOpen.lesson_id}`}>
              <Button type="button">
                <Play className="mr-1 size-4" />
                {status === "completed" ? "Review the course" : "Continue"}
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {program ? (
            <>
              <p className="text-sm">
                This course is part of the program{" "}
                <strong>{program.title}</strong>. Join the program to take it.
              </p>
              <Link href={`/bible-school/learn/program/${program.program_id}`}>
                <Button type="button">See the program</Button>
              </Link>
            </>
          ) : (
            <>
              {course.capacity !== null && !blocker && (
                <p className="text-sm">
                  {Math.max(0, course.capacity - course.seats_taken)} seats left
                </p>
              )}
              <Button
                type="button"
                disabled={busy || blocker !== null}
                onClick={join}
              >
                {busy ? "Please wait..." : "Join this course"}
              </Button>
              {blocker && (
                <p className="text-xs text-muted-foreground">{blocker}</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(modules).map(([key, lessons]) => (
          <div key={key} className="space-y-2">
            <h2 className="font-heading text-base font-bold">
              {key.split("|")[0]}
            </h2>
            {lessons.map((l) => {
              const locked = l.locked;
              const inner = (
                <Card
                  className={
                    locked
                      ? "opacity-60"
                      : "transition-colors hover:bg-muted/40"
                  }
                >
                  <CardContent className="flex items-center gap-3 py-3">
                    {l.completed ? (
                      <CheckCircle2 className="size-5 text-primary" />
                    ) : locked ? (
                      <Lock className="size-5 text-muted-foreground" />
                    ) : (
                      <Play className="size-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.lesson_title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.content_type}
                        {l.duration_minutes
                          ? ` · ${l.duration_minutes} min`
                          : ""}
                        {l.is_free_preview && !joined ? " · free preview" : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
              return locked ? (
                <div key={l.lesson_id}>{inner}</div>
              ) : (
                <Link
                  key={l.lesson_id}
                  href={`/bible-school/learn/lesson/${l.lesson_id}`}
                  className="block"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
