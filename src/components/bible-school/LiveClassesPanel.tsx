"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSessionAction,
  loadAttendanceRosterAction,
  scheduleSessionAction,
  setAttendanceAction,
  setRecordingAction,
  updateSessionAction,
} from "@/lib/lms/live-actions";
import type { LmsResult } from "@/lib/lms/actions";
import {
  ATTENDANCE_LABELS,
  SESSION_MODES,
  durationMinutes,
  toLocalInput,
  whenText,
} from "@/lib/lms/live";
import type { AttendanceRosterRow, SessionRow } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const EMPTY = {
  title: "",
  description: "",
  startsAtLocal: "",
  durationMinutes: "60",
  mode: "video",
};

function stateOf(
  session: SessionRow,
  now: number,
): {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  if (session.status === "cancelled")
    return { label: "Cancelled", variant: "destructive" };
  if (now > new Date(session.ends_at).getTime())
    return { label: "Completed", variant: "outline" };
  if (now >= new Date(session.starts_at).getTime())
    return { label: "Live now", variant: "default" };
  return { label: "Upcoming", variant: "secondary" };
}

export function LiveClassesPanel({
  organizationId,
  courseId,
  sessions,
  timeZone,
  canSchedule,
}: {
  organizationId: string;
  /** Set on a course's own page; the form schedules for that course. */
  courseId?: string;
  sessions: SessionRow[];
  timeZone: string;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState<{
    id: string;
    kind: "attendance" | "recording";
  } | null>(null);
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([]);
  const [recording, setRecording] = useState("");
  // The clock the status badges use, kept moving so "Upcoming" becomes "Live now" without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function run(
    action: () => Promise<LmsResult>,
    done?: string,
    after?: () => void,
  ) {
    setError(null);
    setErrors({});
    setNotice(null);
    startTransition(async () => {
      const result = await action().catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else {
        if (done) setNotice(done);
        after?.();
        router.refresh();
      }
    });
  }

  function openAttendance(sessionId: string) {
    setOpen({ id: sessionId, kind: "attendance" });
    startTransition(async () => {
      const result = await loadAttendanceRosterAction(
        organizationId,
        sessionId,
      );
      if (result.error) setError(result.error);
      else setRoster(result.roster ?? []);
    });
  }

  function mark(
    sessionId: string,
    memberId: string,
    status: "present" | "absent" | "excused",
  ) {
    setRoster((r) =>
      r.map((row) =>
        row.memberId === memberId ? { ...row, status, source: "manual" } : row,
      ),
    );
    run(() => setAttendanceAction(organizationId, sessionId, memberId, status));
  }

  const set =
    (key: keyof typeof EMPTY) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      {canSchedule && courseId && editing === null && (
        <Button
          onClick={() => {
            setForm(EMPTY);
            setEditing("new");
          }}
        >
          Schedule a class
        </Button>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">
              {editing === "new" ? "Schedule a class" : "Change this class"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="class-title">Title</Label>
              <Input
                id="class-title"
                value={form.title}
                onChange={set("title")}
                maxLength={120}
                placeholder="Week 1: The Book of Genesis"
              />
              <FieldError id="class-title-error" message={errors.title} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-description">
                What it covers (optional)
              </Label>
              <Textarea
                id="class-description"
                rows={2}
                value={form.description}
                onChange={set("description")}
                maxLength={2000}
              />
              <FieldError
                id="class-description-error"
                message={errors.description}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="class-start">Starts ({timeZone})</Label>
                <Input
                  id="class-start"
                  type="datetime-local"
                  value={form.startsAtLocal}
                  onChange={set("startsAtLocal")}
                />
                <FieldError
                  id="class-start-error"
                  message={errors.startsAtLocal}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-length">Length (minutes)</Label>
                <Input
                  id="class-length"
                  type="number"
                  min={15}
                  max={480}
                  value={form.durationMinutes}
                  onChange={set("durationMinutes")}
                />
                <FieldError
                  id="class-length-error"
                  message={errors.durationMinutes}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-mode">Kind</Label>
                <select
                  id="class-mode"
                  value={form.mode}
                  onChange={set("mode")}
                  className={SELECT_CLASS}
                  disabled={editing !== "new"}
                >
                  {SESSION_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <FieldError id="class-mode-error" message={errors.mode} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Students of the course are notified, and again about 10 minutes
              before it starts (when the reminder job is set up). The class
              takes place in a K-Connect room, which ends by itself at your
              plan&apos;s call limit.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      editing === "new"
                        ? scheduleSessionAction(organizationId, courseId!, form)
                        : updateSessionAction(organizationId, editing, form),
                    editing === "new"
                      ? "Class scheduled. Students have been notified."
                      : "Class updated.",
                    () => setEditing(null),
                  )
                }
              >
                {pending
                  ? "Saving..."
                  : editing === "new"
                    ? "Schedule"
                    : "Save changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No live classes yet.
            {canSchedule && courseId ? " Schedule the first one above." : ""}
          </CardContent>
        </Card>
      ) : (
        sessions.map((session) => {
          const state = stateOf(session, now);
          const hostPath = session.mode === "audio" ? "kaudio" : "kmeet";
          const canStart =
            session.status === "scheduled" &&
            session.meeting_id &&
            now <= new Date(session.ends_at).getTime() &&
            now >= new Date(session.starts_at).getTime() - 60 * 60_000;
          return (
            <Card key={session.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{session.title}</span>
                      <Badge variant={state.variant}>{state.label}</Badge>
                      <Badge variant="outline">
                        {session.mode === "audio" ? "Audio" : "Video"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {!courseId && `${session.courseTitle} · `}
                      {whenText(session.starts_at, timeZone)} ·{" "}
                      {durationMinutes(session.starts_at, session.ends_at)} min
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.attendance.present} present ·{" "}
                      {session.attendance.absent} absent ·{" "}
                      {session.attendance.excused} excused ·{" "}
                      {session.attendance.unmarked} not marked, of{" "}
                      {session.students} students
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {canStart && (
                      <Button
                        size="sm"
                        nativeButton={false}
                        render={
                          <a
                            href={`/dashboard/${hostPath}/${session.meeting_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Start class
                          </a>
                        }
                      />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        open?.id === session.id && open.kind === "attendance"
                          ? setOpen(null)
                          : openAttendance(session.id)
                      }
                    >
                      Attendance
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRecording(session.recording_url ?? "");
                        setOpen(
                          open?.id === session.id && open.kind === "recording"
                            ? null
                            : { id: session.id, kind: "recording" },
                        );
                      }}
                    >
                      Recording
                    </Button>
                    {canSchedule && session.status === "scheduled" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setForm({
                              title: session.title,
                              description: session.description ?? "",
                              startsAtLocal: toLocalInput(
                                session.starts_at,
                                timeZone,
                              ),
                              durationMinutes: String(
                                durationMinutes(
                                  session.starts_at,
                                  session.ends_at,
                                ),
                              ),
                              mode: session.mode,
                            });
                            setEditing(session.id);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            if (
                              confirm(
                                `Cancel "${session.title}"? Students will be told.`,
                              )
                            )
                              run(
                                () =>
                                  cancelSessionAction(
                                    organizationId,
                                    session.id,
                                  ),
                                "Class cancelled.",
                              );
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {open?.id === session.id && open.kind === "attendance" && (
                  <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Students are marked present when they open the class in
                      the app. You can change anyone&apos;s mark.
                    </p>
                    {roster.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No enrolled students.
                      </p>
                    )}
                    {roster.map((row) => (
                      <div
                        key={row.memberId}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {row.name}
                          {row.source === "app" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              joined from the app
                            </span>
                          )}
                        </span>
                        <span className="flex gap-1">
                          {(["present", "absent", "excused"] as const).map(
                            (status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant={
                                  row.status === status ? "default" : "outline"
                                }
                                disabled={pending}
                                onClick={() =>
                                  mark(session.id, row.memberId, status)
                                }
                              >
                                {ATTENDANCE_LABELS[status]}
                              </Button>
                            ),
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {open?.id === session.id && open.kind === "recording" && (
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <Label htmlFor={`recording-${session.id}`}>
                      Link to the recording (https)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id={`recording-${session.id}`}
                        value={recording}
                        onChange={(e) => setRecording(e.target.value)}
                        placeholder="https://"
                        inputMode="url"
                      />
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setRecordingAction(
                                organizationId,
                                session.id,
                                recording,
                              ),
                            "Recording link saved.",
                            () => setOpen(null),
                          )
                        }
                      >
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Students see it with the class once it has ended. Upload
                      the video to YouTube or another host and paste its link,
                      or add it as a video lesson.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
