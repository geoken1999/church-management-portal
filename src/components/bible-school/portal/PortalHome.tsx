"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Video } from "lucide-react";
import {
  portal,
  portalError,
  type PCourse,
  type PMyCourse,
  type PCertificate,
  type PMyProgram,
  type PProgram,
  type PSession,
} from "@/lib/lms/portal-client";
import { usePortal } from "@/components/bible-school/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Tab = "mine" | "programs" | "live" | "certificates";

export function PortalHome() {
  const { identity } = usePortal();
  const [tab, setTab] = useState<Tab>("mine");
  const [mine, setMine] = useState<PMyCourse[] | null>(null);
  const [all, setAll] = useState<PCourse[] | null>(null);
  const [programs, setPrograms] = useState<PProgram[] | null>(null);
  const [myPrograms, setMyPrograms] = useState<PMyProgram[] | null>(null);
  const [inProgram, setInProgram] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<PSession[] | null>(null);
  const [certificates, setCertificates] = useState<PCertificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, a, s, p, mp, certs] = await Promise.all([
        portal.myCourses(identity.organizationId),
        portal.catalog(identity.organizationId),
        portal.sessions(identity.organizationId),
        portal.programs(identity.organizationId),
        portal.myPrograms(identity.organizationId),
        portal
          .certificates(identity.organizationId)
          .catch(() => [] as PCertificate[]),
      ]);
      // A course that belongs to a program is joined through it, so it is not listed on its own.
      const lists = await Promise.all(
        p.map((x) => portal.programCourses(x.program_id)),
      );
      setInProgram(new Set(lists.flat().map((c) => c.course_id)));
      setMine(m);
      setAll(a);
      setSessions(s);
      setPrograms(p);
      setMyPrograms(mp);
      setCertificates(certs);
    } catch (e) {
      setError(portalError(e, "Couldn't load your courses."));
    }
  }, [identity.organizationId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Welcome, {identity.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Learn at your own pace. Your progress is saved.
        </p>
      </div>
      <div className="flex gap-2 border-b border-border">
        {(
          [
            ["mine", "My courses"],
            ["programs", "Programs"],
            ["live", "Live classes"],
            ["certificates", "Certificates"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {tab === "mine" && <MyCourses courses={mine} programs={myPrograms} />}
      {tab === "programs" && (
        <Programs
          programs={programs}
          courses={all ? all.filter((c) => !inProgram.has(c.course_id)) : null}
        />
      )}
      {tab === "certificates" && <Certificates certificates={certificates} />}
      {tab === "live" && (
        <LiveClasses
          sessions={sessions}
          name={`${identity.firstName} ${identity.lastName}`.trim()}
          onChanged={load}
        />
      )}
    </div>
  );
}

function MyCourses({
  courses,
  programs,
}: {
  courses: PMyCourse[] | null;
  programs: PMyProgram[] | null;
}) {
  if (!courses)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (courses.length === 0 && (programs ?? []).length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t joined a program yet. Open &quot;Programs&quot; to find
        one.
      </p>
    );
  return (
    <div className="space-y-3">
      {(programs ?? []).map((p) => (
        <Link
          key={p.enrollment_id}
          href={`/bible-school/learn/program/${p.program_id}`}
          className="block"
        >
          <Card className="border-primary/30 transition-colors hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  Program · {p.courses_done} of {p.courses_total} required
                  courses done
                </p>
              </div>
              {p.status === "pending" ? (
                <Badge variant="secondary">Waiting for approval</Badge>
              ) : p.status === "completed" ? (
                <Badge>Completed</Badge>
              ) : null}
            </CardContent>
          </Card>
        </Link>
      ))}
      {courses.map((c) => {
        const pct =
          c.status === "completed"
            ? 100
            : c.required_total
              ? Math.round((c.required_done / c.required_total) * 100)
              : 0;
        return (
          <Link
            key={c.enrollment_id}
            href={`/bible-school/learn/course/${c.course_id}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.title}</p>
                  {c.status === "pending" ? (
                    <Badge variant="secondary">Waiting for approval</Badge>
                  ) : c.status === "completed" ? (
                    <Badge>Completed</Badge>
                  ) : null}
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.required_done} of {c.required_total} required lessons done
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function Programs({
  programs,
  courses,
}: {
  programs: PProgram[] | null;
  courses: PCourse[] | null;
}) {
  if (!programs || !courses)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (programs.length === 0 && courses.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is open right now.
      </p>
    );
  return (
    <div className="space-y-3">
      {programs.map((p) => (
        <Link
          key={p.program_id}
          href={`/bible-school/learn/program/${p.program_id}`}
          className="block"
        >
          <Card className="transition-colors hover:bg-muted/40">
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{p.title}</p>
                {p.my_status ? (
                  <Badge variant="outline">{p.my_status}</Badge>
                ) : p.price_amount ? (
                  <Badge variant="secondary">₹{p.price_amount}</Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
              </div>
              {p.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {p.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {p.course_count} courses · {p.lesson_count} lessons
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
      {courses.length > 0 && (
        <h2 className="pt-2 font-heading text-lg font-bold">Single courses</h2>
      )}
      {courses.map((c) => (
        <Link
          key={c.course_id}
          href={`/bible-school/learn/course/${c.course_id}`}
          className="block"
        >
          <Card className="transition-colors hover:bg-muted/40">
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{c.title}</p>
                {c.my_status ? (
                  <Badge variant="outline">{c.my_status}</Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
              </div>
              {c.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {c.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {c.lesson_count} lessons
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function LiveClasses({
  sessions,
  name,
  onChanged,
}: {
  sessions: PSession[] | null;
  name: string;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  if (!sessions)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  const upcoming = sessions
    .filter(
      (s) => s.status !== "cancelled" && new Date(s.ends_at).getTime() > now,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = sessions
    .filter(
      (s) => s.status === "cancelled" || new Date(s.ends_at).getTime() <= now,
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  if (sessions.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No live classes yet. Your teachers will schedule them here.
      </p>
    );

  async function join(s: PSession) {
    setError(null);
    try {
      const j = await portal.join(s.session_id);
      const base = j.mode === "audio" ? "kaudio" : "kmeet";
      window.open(
        `/${base}/${j.meeting_id}?name=${encodeURIComponent(name)}`,
        "_blank",
        "noopener",
      );
      await onChanged();
    } catch (e) {
      setError(portalError(e, "Couldn't open the class."));
    }
  }

  const row = (s: PSession, over: boolean) => (
    <Card key={s.session_id}>
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{s.title}</p>
          {s.status === "cancelled" && (
            <Badge variant="destructive">Cancelled</Badge>
          )}
          {s.my_attendance === "present" && (
            <Badge variant="secondary">You attended</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {s.course_title} · {new Date(s.starts_at).toLocaleString()}
        </p>
        {!over && s.can_join && (
          <Button type="button" size="sm" onClick={() => join(s)}>
            <Video className="mr-1 size-4" /> Join the class
          </Button>
        )}
        {!over && !s.can_join && s.status !== "cancelled" && (
          <p className="text-xs text-muted-foreground">
            Opens 15 minutes before it starts
          </p>
        )}
        {over && s.recording_url && (
          <a
            href={s.recording_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline"
          >
            Watch the recording
          </a>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {upcoming.length > 0 && (
        <h2 className="font-heading text-lg font-bold">Coming up</h2>
      )}
      {upcoming.map((s) => row(s, false))}
      {past.length > 0 && (
        <h2 className="pt-2 font-heading text-lg font-bold">Earlier</h2>
      )}
      {past.map((s) => row(s, true))}
    </div>
  );
}

function Certificates({
  certificates,
}: {
  certificates: PCertificate[] | null;
}) {
  if (!certificates)
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (certificates.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        You have no certificates yet. You get one when you finish a course or a
        program.
      </p>
    );
  return (
    <div className="space-y-3">
      {certificates.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {c.kind === "program" ? "Program" : "Course"} ·{" "}
                {new Date(c.issued_at).toLocaleDateString()}
                {c.percent !== null ? ` · ${c.percent}%` : ""} · code {c.code}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/certificate/${c.code}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" size="sm">
                  Download
                </Button>
              </a>
              <a
                href={`/verify/certificate/${c.code}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" size="sm" variant="outline">
                  Check
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
