"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  deleteLessonAction,
  deleteModuleAction,
  moveLessonAction,
  moveModuleAction,
  removeLessonFileAction,
  createLessonUploadAction,
  finalizeLessonUploadAction,
  saveLessonAction,
  saveModuleAction,
  setLessonStatusAction,
  setModuleStatusAction,
  type LmsResult,
} from "@/lib/lms/actions";
import { LESSON_TYPES } from "@/lib/lms/constants";
import { QuizEditor } from "@/components/bible-school/QuizEditor";
import { AssignmentEditor } from "@/components/bible-school/AssignmentEditor";
import type { ModuleWithLessons } from "@/lib/lms/dal";
import type { LmsLesson, LmsPublishState } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";
import { toast } from "sonner";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  formatClock,
  formatFileSize,
  minutesFromSeconds,
  readMediaInfo,
} from "@/lib/lms/media-metadata";
import { RichTextEditor } from "@/components/bible-school/RichTextEditor";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function statusVariant(status: LmsPublishState) {
  return status === "published" ? "default" : "secondary";
}

export function CurriculumBuilder({
  organizationId,
  courseId,
  modules,
}: {
  organizationId: string;
  courseId: string;
  modules: ModuleWithLessons[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [moduleDraft, setModuleDraft] = useState({
    title: "",
    description: "",
  });
  const [quizOpen, setQuizOpen] = useState<string | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState<{
    moduleId: string;
    lesson: LmsLesson | null;
  } | null>(null);

  function run(action: () => Promise<LmsResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action().catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else if (result.fieldErrors)
        setError(
          Object.values(result.fieldErrors).find(Boolean) ??
            "Check the details and try again.",
        );
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              saveModuleAction(organizationId, courseId, null, {
                title: newTitle,
                description: "",
              }),
            () => setNewTitle(""),
          );
        }}
      >
        <Input
          className="max-w-sm"
          placeholder="New module title, like Introduction to Genesis"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={120}
        />
        <Button type="submit" disabled={pending || newTitle.trim().length < 2}>
          Add module
        </Button>
      </form>

      {modules.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No modules yet. Add the first module above, then add lessons to it.
          </CardContent>
        </Card>
      )}

      {modules.map((module_, mi) => (
        <Card key={module_.id}>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Module {mi + 1}
                </span>
                <span className="font-medium">{module_.title}</span>
                <Badge variant={statusVariant(module_.status)}>
                  {module_.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || mi === 0}
                  aria-label="Move module up"
                  onClick={() =>
                    run(() =>
                      moveModuleAction(
                        organizationId,
                        courseId,
                        module_.id,
                        -1,
                      ),
                    )
                  }
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || mi === modules.length - 1}
                  aria-label="Move module down"
                  onClick={() =>
                    run(() =>
                      moveModuleAction(organizationId, courseId, module_.id, 1),
                    )
                  }
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingModule(
                      editingModule === module_.id ? null : module_.id,
                    );
                    setModuleDraft({
                      title: module_.title,
                      description: module_.description ?? "",
                    });
                  }}
                >
                  Edit
                </Button>
                {module_.status !== "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setModuleStatusAction(
                          organizationId,
                          courseId,
                          module_.id,
                          "published",
                        ),
                      )
                    }
                  >
                    Publish
                  </Button>
                )}
                {module_.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setModuleStatusAction(
                          organizationId,
                          courseId,
                          module_.id,
                          "draft",
                        ),
                      )
                    }
                  >
                    Unpublish
                  </Button>
                )}
                {module_.status === "draft" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete the module "${module_.title}" and its lessons?`,
                        )
                      )
                        run(() =>
                          deleteModuleAction(
                            organizationId,
                            courseId,
                            module_.id,
                          ),
                        );
                    }}
                  >
                    Delete
                  </Button>
                ) : (
                  module_.status !== "archived" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setModuleStatusAction(
                            organizationId,
                            courseId,
                            module_.id,
                            "archived",
                          ),
                        )
                      }
                    >
                      Archive
                    </Button>
                  )
                )}
              </div>
            </div>

            {editingModule === module_.id && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <Input
                  value={moduleDraft.title}
                  onChange={(e) =>
                    setModuleDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  maxLength={120}
                  aria-label="Module title"
                />
                <Textarea
                  rows={2}
                  value={moduleDraft.description}
                  onChange={(e) =>
                    setModuleDraft((d) => ({
                      ...d,
                      description: e.target.value,
                    }))
                  }
                  maxLength={2000}
                  placeholder="What this module covers (optional)"
                />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        saveModuleAction(
                          organizationId,
                          courseId,
                          module_.id,
                          moduleDraft,
                        ),
                      () => setEditingModule(null),
                    )
                  }
                >
                  Save module
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              {module_.lessons.map((lesson, li) => (
                <div
                  key={lesson.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {li + 1}.
                    </span>
                    <span className="font-medium">{lesson.title}</span>
                    <Badge variant="outline">
                      {LESSON_TYPES.find((t) => t.value === lesson.content_type)
                        ?.label ?? lesson.content_type}
                    </Badge>
                    <Badge variant={statusVariant(lesson.status)}>
                      {lesson.status}
                    </Badge>
                    {!lesson.is_required && (
                      <Badge variant="outline">optional</Badge>
                    )}
                    {lesson.is_free_preview && (
                      <Badge variant="outline">free preview</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || li === 0}
                      aria-label="Move lesson up"
                      onClick={() =>
                        run(() =>
                          moveLessonAction(
                            organizationId,
                            courseId,
                            lesson.id,
                            -1,
                          ),
                        )
                      }
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || li === module_.lessons.length - 1}
                      aria-label="Move lesson down"
                      onClick={() =>
                        run(() =>
                          moveLessonAction(
                            organizationId,
                            courseId,
                            lesson.id,
                            1,
                          ),
                        )
                      }
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setLessonForm({ moduleId: module_.id, lesson })
                      }
                    >
                      Edit
                    </Button>
                    {lesson.content_type === "quiz" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setQuizOpen(quizOpen === lesson.id ? null : lesson.id)
                        }
                      >
                        Questions
                      </Button>
                    )}
                    {lesson.content_type === "assignment" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAssignmentOpen(
                            assignmentOpen === lesson.id ? null : lesson.id,
                          )
                        }
                      >
                        Instructions
                      </Button>
                    )}
                    {lesson.status !== "published" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setLessonStatusAction(
                              organizationId,
                              courseId,
                              lesson.id,
                              "published",
                            ),
                          )
                        }
                      >
                        Publish
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setLessonStatusAction(
                              organizationId,
                              courseId,
                              lesson.id,
                              "draft",
                            ),
                          )
                        }
                      >
                        Unpublish
                      </Button>
                    )}
                    {lesson.status === "draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Delete the lesson "${lesson.title}"?`))
                            run(() =>
                              deleteLessonAction(
                                organizationId,
                                courseId,
                                lesson.id,
                              ),
                            );
                        }}
                      >
                        Delete
                      </Button>
                    ) : (
                      lesson.status !== "archived" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              setLessonStatusAction(
                                organizationId,
                                courseId,
                                lesson.id,
                                "archived",
                              ),
                            )
                          }
                        >
                          Archive
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
              {module_.lessons.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No lessons in this module yet.
                </p>
              )}
            </div>

            {module_.lessons
              .filter((l) => l.id === quizOpen)
              .map((l) => (
                <QuizEditor
                  key={l.id}
                  organizationId={organizationId}
                  courseId={courseId}
                  lessonId={l.id}
                  onClose={() => setQuizOpen(null)}
                />
              ))}

            {module_.lessons
              .filter((l) => l.id === assignmentOpen)
              .map((l) => (
                <AssignmentEditor
                  key={l.id}
                  organizationId={organizationId}
                  courseId={courseId}
                  lessonId={l.id}
                  onClose={() => setAssignmentOpen(null)}
                />
              ))}

            {lessonForm?.moduleId === module_.id ? (
              <LessonForm
                key={lessonForm.lesson?.id ?? "new"}
                organizationId={organizationId}
                courseId={courseId}
                moduleId={module_.id}
                lesson={lessonForm.lesson}
                onClose={() => setLessonForm(null)}
                onSaved={() => {
                  setLessonForm(null);
                  router.refresh();
                }}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setLessonForm({ moduleId: module_.id, lesson: null })
                }
              >
                Add lesson
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LessonForm({
  organizationId,
  courseId,
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  organizationId: string;
  courseId: string;
  moduleId: string;
  lesson: LmsLesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: lesson?.title ?? "",
    contentType: lesson?.content_type ?? "text",
    body: lesson?.body ?? "",
    mediaUrl: lesson?.media_url ?? "",
    durationMinutes: lesson?.duration_minutes?.toString() ?? "",
    isRequired: lesson?.is_required ?? true,
    isFreePreview: lesson?.is_free_preview ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(
    lesson?.file_name ?? null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // What was read from the chosen video or audio file (length, picture size, file size).
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  const isMedia = form.contentType === "video" || form.contentType === "audio";
  const type = LESSON_TYPES.find((t) => t.value === form.contentType);

  // Sends a file for a lesson straight to storage and attaches it. Returns a message if it failed.
  // Any failure on the way (network, a server hiccup) comes back as a message, never an exception.
  async function uploadFile(
    lessonId: string,
    file: File,
  ): Promise<string | null> {
    try {
      return await sendFile(lessonId, file);
    } catch {
      return "The upload failed. Check your connection and try again.";
    }
  }

  async function sendFile(
    lessonId: string,
    file: File,
  ): Promise<string | null> {
    const start = await createLessonUploadAction(
      organizationId,
      courseId,
      lessonId,
      {
        name: file.name,
        type: file.type,
        size: file.size,
      },
    );
    if (start.error || !start.path || !start.token)
      return start.error ?? "Couldn't start the upload.";
    const { error: uploadError } = await createBrowserClient()
      .storage.from("lms-lesson-files")
      .uploadToSignedUrl(start.path, start.token, file, {
        contentType: file.type,
      });
    if (uploadError) {
      return uploadError.message?.toLowerCase().includes("size")
        ? "The file is larger than the storage limit. Ask your administrator to raise the upload limit in Supabase."
        : `The upload failed (${uploadError.message}). Check your connection and try again.`;
    }
    const done = await finalizeLessonUploadAction(
      organizationId,
      courseId,
      lessonId,
      start.path,
      file.name,
    );
    return done.error ?? null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await saveLessonAction(
        organizationId,
        courseId,
        moduleId,
        lesson?.id ?? null,
        {
          ...form,
          hasFile: Boolean(fileName || pendingFile),
        },
      ).catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
        return;
      }
      const savedId = lesson?.id ?? result.id;
      if (pendingFile && savedId) {
        setStatus(`Uploading ${pendingFile.name}…`);
        const problem = await uploadFile(savedId, pendingFile);
        setStatus(null);
        if (problem) {
          // The lesson itself is saved; say why the file is not attached and let them retry from Edit.
          toast.error(
            `The lesson was saved, but its file was not attached: ${problem} Open the lesson with Edit to try again.`,
          );
        }
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-primary/40 bg-muted/30 p-3"
    >
      <ErrorToast message={error} />
      <p className="text-sm font-medium">
        {lesson ? "Edit lesson" : "New lesson"}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_120px]">
        <div className="space-y-1.5">
          <Label htmlFor="lesson-title">Title</Label>
          <Input
            id="lesson-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={160}
          />
          <FieldError id="lesson-title-error" message={errors.title} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-type">Type</Label>
          <select
            id="lesson-type"
            value={form.contentType}
            onChange={(e) => {
              const next = e.target.value as typeof form.contentType;
              setForm((f) => ({ ...f, contentType: next }));
              // A file picked for a video can't follow the lesson to a type that takes no file.
              const nextType = LESSON_TYPES.find((t) => t.value === next);
              if (!nextType?.allowsUpload) setPendingFile(null);
            }}
            className={SELECT_CLASS}
          >
            {LESSON_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError id="lesson-type-error" message={errors.contentType} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-minutes">Minutes</Label>
          <Input
            id="lesson-minutes"
            type="number"
            min={0}
            readOnly={
              isMedia && Boolean(mediaNote && (fileName || pendingFile))
            }
            title={
              isMedia && mediaNote && (fileName || pendingFile)
                ? "Read from the uploaded file"
                : undefined
            }
            value={form.durationMinutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, durationMinutes: e.target.value }))
            }
          />
          <FieldError
            id="lesson-minutes-error"
            message={errors.durationMinutes}
          />
        </div>
      </div>

      {type?.allowsLink ? (
        <div className="space-y-1.5">
          <Label htmlFor="lesson-link">Link (https://)</Label>
          <Input
            id="lesson-link"
            value={form.mediaUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, mediaUrl: e.target.value }))
            }
            placeholder="https://"
            inputMode="url"
          />
          <FieldError id="lesson-link-error" message={errors.mediaUrl} />
        </div>
      ) : null}

      {type?.allowsUpload && (
        <div className="space-y-1.5">
          <Label htmlFor="lesson-file">
            {form.contentType === "video"
              ? "Upload the video (MP4, up to 500 MB)"
              : form.contentType === "audio"
                ? "Upload the audio (MP3 or M4A, up to 100 MB)"
                : "Or upload a file (PDF, Word, PowerPoint or Excel, up to 25 MB)"}
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            {(pendingFile?.name ?? fileName) && (
              <span className="text-sm">
                {pendingFile
                  ? `${pendingFile.name} (uploads when you save)`
                  : fileName}
              </span>
            )}
            <Input
              id="lesson-file"
              type="file"
              className="max-w-xs"
              disabled={pending}
              accept={
                form.contentType === "video"
                  ? ".mp4,video/mp4"
                  : form.contentType === "audio"
                    ? ".mp3,.m4a,audio/mpeg,audio/mp4"
                    : ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError(null);
                setMediaNote(null);
                // Video and audio: take the length from the file itself.
                const kind =
                  form.contentType === "video" || form.contentType === "audio"
                    ? form.contentType
                    : null;
                if (kind) {
                  const read = readMediaInfo(file, kind).then((info) => {
                    if (!info) return;
                    setForm((f) => ({
                      ...f,
                      durationMinutes: String(minutesFromSeconds(info.seconds)),
                    }));
                    const size =
                      info.width && info.height
                        ? ` · ${info.width}×${info.height}`
                        : "";
                    setMediaNote(
                      `Length ${formatClock(info.seconds)}${size} · ${formatFileSize(file.size)}. Minutes filled in from the file.`,
                    );
                  });
                  void read;
                }
                if (lesson) {
                  // An existing lesson: upload right away.
                  startTransition(async () => {
                    setStatus(`Uploading ${file.name}…`);
                    const problem = await uploadFile(lesson.id, file);
                    setStatus(null);
                    if (problem) setError(problem);
                    else setFileName(file.name);
                  });
                } else {
                  // A new lesson has no id yet: the file uploads as soon as the lesson is saved.
                  setPendingFile(file);
                }
              }}
            />
            {mediaNote && (fileName || pendingFile) && (
              <p className="basis-full text-xs text-muted-foreground">
                {mediaNote}
                {lesson ? " Save the lesson to keep it." : ""}
              </p>
            )}
            {(fileName || pendingFile) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (pendingFile || !lesson) {
                    setPendingFile(null);
                    setMediaNote(null);
                    return;
                  }
                  startTransition(async () => {
                    const result = await removeLessonFileAction(
                      organizationId,
                      courseId,
                      lesson.id,
                    );
                    if (result.error) setError(result.error);
                    else setFileName(null);
                  });
                }}
              >
                {pendingFile ? "Clear" : "Remove file"}
              </Button>
            )}
          </div>
          {status && (
            <p className="text-xs text-muted-foreground">
              {status} Large videos take a few minutes. Keep this page open.
            </p>
          )}
          {!type?.allowsLink && (
            <FieldError id="lesson-file-error" message={errors.mediaUrl} />
          )}
          {!type?.allowsLink && form.mediaUrl && !fileName && !pendingFile && (
            <p className="text-xs text-muted-foreground">
              This lesson still uses an older link ({form.mediaUrl}). Upload a
              file to replace it.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Files are private: only enrolled students can open them.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {form.contentType === "text" && <Label>Lesson text</Label>}
        {form.contentType === "text" ? (
          <RichTextEditor
            value={form.body}
            onChange={(html) => setForm((f) => ({ ...f, body: html }))}
          />
        ) : form.contentType === "quiz" ? (
          <p className="text-xs text-muted-foreground">
            Save the lesson, then press Questions on it to write the quiz.
            Students pass the quiz to complete the lesson, so a required quiz
            counts towards finishing the course.
          </p>
        ) : form.contentType === "assignment" ? (
          <p className="text-xs text-muted-foreground">
            Save the lesson, then press Instructions on it to say what students
            hand in, how it is marked and when it is due. Handing it in
            completes the lesson, so a required assignment counts towards
            finishing the course.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            This lesson type shows its link. Add reading notes by creating a
            Reading lesson next to it.
          </p>
        )}
        <FieldError id="lesson-body-error" message={errors.body} />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isRequired}
            onChange={(e) =>
              setForm((f) => ({ ...f, isRequired: e.target.checked }))
            }
          />
          Required to complete the course
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isFreePreview}
            onChange={(e) =>
              setForm((f) => ({ ...f, isFreePreview: e.target.checked }))
            }
          />
          Free preview (visible without enrolling)
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save lesson"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
