"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  portal,
  portalError,
  type PLesson,
  type POutlineItem,
} from "@/lib/lms/portal-client";
import {
  PlaybackReporter,
  isDirectMediaUrl,
  resumePoint,
} from "@/lib/lms/playback-reporter";
import { QuizTaker } from "@/components/bible-school/portal/QuizTaker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PortalLesson({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<PLesson | null>(null);
  const [outline, setOutline] = useState<POutlineItem[]>([]);
  const [completed, setCompleted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [watched, setWatched] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshOutline = useCallback(async (courseId: string) => {
    try {
      setOutline(await portal.outline(courseId));
    } catch {
      /* the lesson itself still works */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await portal.lesson(lessonId);
        if (cancelled) return;
        setLesson(l);
        setCompleted(l.completed);
        setBookmarked(l.bookmarked);
        setNote(l.note);
        setWatched(
          l.duration_seconds
            ? Math.min(1, l.watched_seconds / l.duration_seconds)
            : null,
        );
        await refreshOutline(l.course_id);
      } catch (e) {
        if (!cancelled) setError(portalError(e, "Couldn't open this lesson."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId, refreshOutline]);

  const { next, previous } = useMemo(() => {
    const index = outline.findIndex((l) => l.lesson_id === lessonId);
    const open = (item: POutlineItem | undefined) =>
      item && !item.locked ? item : undefined;
    let n: POutlineItem | undefined;
    let p: POutlineItem | undefined;
    for (let i = index + 1; index >= 0 && i < outline.length; i++)
      if (open(outline[i])) {
        n = outline[i];
        break;
      }
    for (let i = index - 1; i >= 0; i--)
      if (open(outline[i])) {
        p = outline[i];
        break;
      }
    return { next: n, previous: p };
  }, [outline, lessonId]);

  async function toggleDone() {
    if (!lesson || busy) return;
    setBusy(true);
    setError(null);
    try {
      const progress = await portal.complete(lessonId, !completed);
      setCompleted(!completed);
      if (!completed && progress.course_completed)
        setNotice("You finished the course. Well done!");
      await refreshOutline(lesson.course_id);
    } catch (e) {
      setError(portalError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(nextBookmark = bookmarked) {
    try {
      await portal.note(lessonId, note, nextBookmark);
      setNoteDirty(false);
    } catch (e) {
      setError(portalError(e));
    }
  }

  const onReport = useCallback(
    async (position: number, duration: number) => {
      if (!lesson?.enrolled) return;
      try {
        const result = await portal.playback(lessonId, position, duration);
        setWatched(
          result.duration_seconds
            ? Math.min(1, result.watched_seconds / result.duration_seconds)
            : null,
        );
        if (result.completed) {
          setCompleted((was) => {
            if (!was) {
              if (result.course_completed)
                setNotice("You finished the course. Well done!");
              void refreshOutline(lesson.course_id);
            }
            return true;
          });
        }
      } catch {
        /* the next report carries on from where playback is by then */
      }
    },
    [lesson, lessonId, refreshOutline],
  );

  if (error && !lesson)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline"
          onClick={() => router.back()}
        >
          Go back
        </button>
      </div>
    );
  if (!lesson)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <Link
        href={`/bible-school/learn/course/${lesson.course_id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Course
      </Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{lesson.title}</h1>
        {lesson.enrolled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this lesson"}
            onClick={() => {
              const nextValue = !bookmarked;
              setBookmarked(nextValue);
              void saveNote(nextValue);
            }}
          >
            {bookmarked ? (
              <BookmarkCheck className="size-5" />
            ) : (
              <Bookmark className="size-5" />
            )}
          </Button>
        )}
      </div>

      {notice && (
        <p className="rounded-md bg-primary/10 p-3 text-sm">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {lesson.content_type === "quiz" ? (
        lesson.enrolled ? (
          <QuizTaker
            lessonId={lesson.id}
            onPassed={() => {
              setCompleted(true);
              void refreshOutline(lesson.course_id);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Join the course to take this quiz.
          </p>
        )
      ) : (
        <LessonBody lesson={lesson} onReport={onReport} />
      )}
      {lesson.enrolled &&
        watched !== null &&
        !completed &&
        (lesson.content_type === "video" ||
          lesson.content_type === "audio") && (
          <p className="text-xs text-muted-foreground">
            Watched {Math.round(watched * 100)}% · finishes at 90%
          </p>
        )}

      {lesson.enrolled && (
        <div className="space-y-2">
          <h2 className="font-heading text-base font-bold">My notes</h2>
          <Textarea
            rows={4}
            maxLength={5000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            placeholder="Only you can see your notes."
          />
          {noteDirty && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveNote()}
            >
              Save note
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-4">
        {previous ? (
          <Link
            href={`/bible-school/learn/lesson/${previous.lesson_id}`}
            aria-label="Previous lesson"
          >
            <Button type="button" variant="outline" size="icon">
              <ChevronLeft className="size-4" />
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled
            aria-label="Previous lesson"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <div className="flex-1">
          {lesson.enrolled && lesson.content_type === "quiz" ? (
            <p className="text-center text-sm text-muted-foreground">
              {completed
                ? "Completed: you passed the quiz."
                : "Pass the quiz to complete this lesson."}
            </p>
          ) : lesson.enrolled ? (
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={toggleDone}
            >
              <CheckCircle2 className="mr-1 size-4" />
              {completed ? "Completed" : "Mark as complete"}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Join the course to track your progress.
            </p>
          )}
        </div>
        {next ? (
          <Link
            href={`/bible-school/learn/lesson/${next.lesson_id}`}
            aria-label="Next lesson"
          >
            <Button type="button" variant="outline" size="icon">
              <ChevronRight className="size-4" />
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled
            aria-label="Next lesson"
          >
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function LessonBody({
  lesson,
  onReport,
}: {
  lesson: PLesson;
  onReport: (position: number, duration: number) => void;
}) {
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const isMedia =
    lesson.content_type === "video" || lesson.content_type === "audio";

  useEffect(() => {
    if (!lesson.has_file) return;
    let cancelled = false;
    portal
      .fileLink(lesson.id)
      .then((l) => !cancelled && setLink(l))
      .catch(
        (e) =>
          !cancelled &&
          setLinkError(portalError(e, "Couldn't open this lesson's file.")),
      );
    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.has_file]);

  if (lesson.content_type === "text") {
    return lesson.body?.trim() ? (
      // The text was cleaned of scripts and unsafe tags on the server when it was saved.
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: lesson.body }}
      />
    ) : (
      <p className="text-sm text-muted-foreground">
        This lesson has no text yet.
      </p>
    );
  }

  if (isMedia) {
    const url = lesson.has_file
      ? link?.url
      : lesson.media_url && isDirectMediaUrl(lesson.media_url)
        ? lesson.media_url
        : null;
    if (lesson.has_file && !link)
      return (
        <p className="text-sm text-muted-foreground">
          {linkError ?? "Loading the player..."}
        </p>
      );
    if (!url)
      return lesson.media_url ? (
        <ExternalButton
          href={lesson.media_url}
          label={lesson.content_type === "audio" ? "Listen" : "Watch"}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          This lesson has no media yet.
        </p>
      );
    return (
      <MediaPlayer
        url={url}
        audio={lesson.content_type === "audio"}
        startAt={lesson.position_seconds}
        onReport={lesson.enrolled ? onReport : undefined}
      />
    );
  }

  if (lesson.has_file)
    return link ? (
      <ExternalButton
        href={link.url}
        label={lesson.file_name ?? "Open the file"}
      />
    ) : (
      <p className="text-sm text-muted-foreground">
        {linkError ?? "Preparing the file..."}
      </p>
    );
  if (lesson.media_url)
    return <ExternalButton href={lesson.media_url} label="Open the link" />;
  return <p className="text-sm text-muted-foreground">Nothing to open yet.</p>;
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Button type="button" variant="outline">
        <ExternalLink className="mr-1 size-4" />
        {label}
      </Button>
    </a>
  );
}

// Plays the lesson in the browser (the browser's own controls give pause, skip, speed and full screen),
// resumes where the student left off, and tells the server where they are so the watch time counts and
// the lesson completes by itself at 90%.
function MediaPlayer({
  url,
  audio,
  startAt,
  onReport,
}: {
  url: string;
  audio: boolean;
  startAt: number;
  onReport?: (position: number, duration: number) => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const reporter = useRef(new PlaybackReporter());
  const report = useCallback(
    (force: boolean) => {
      const el = ref.current;
      if (!el || !onReport || !el.duration || !Number.isFinite(el.duration))
        return;
      const position = Math.min(
        Math.floor(el.currentTime),
        Math.floor(el.duration),
      );
      if (reporter.current.shouldReport(Date.now(), position, force))
        onReport(position, Math.floor(el.duration));
    },
    [onReport],
  );

  useEffect(() => {
    const el = ref.current;
    const tracker = reporter.current;
    return () => {
      // Leaving the lesson saves the spot.
      if (el && onReport && el.duration && Number.isFinite(el.duration)) {
        const position = Math.min(
          Math.floor(el.currentTime),
          Math.floor(el.duration),
        );
        if (tracker.shouldReport(Date.now(), position, true))
          onReport(position, Math.floor(el.duration));
      }
    };
  }, [onReport]);

  const common = {
    ref,
    src: url,
    controls: true,
    controlsList: "nodownload",
    preload: "metadata" as const,
    onLoadedMetadata: () => {
      const el = ref.current;
      if (!el) return;
      const at = resumePoint(startAt, el.duration);
      if (at > 0) el.currentTime = at;
    },
    onTimeUpdate: () => report(false),
    onPause: () => report(true),
    onEnded: () => report(true),
  };
  return audio ? (
    <audio {...common} className="w-full" />
  ) : (
    <video {...common} playsInline className="w-full rounded-xl bg-black" />
  );
}
