"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCourseAction,
  setCourseStatusAction,
  setPrerequisitesAction,
  updateCourseAction,
  uploadCourseCoverAction,
  type LmsResult,
} from "@/lib/lms/actions";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import type { CourseInput } from "@/lib/lms/validation";
import type { LmsCourse, LmsPublishState } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { CourseForm } from "@/components/bible-school/CourseForm";

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function courseToInput(course: LmsCourse): CourseInput {
  return {
    title: course.title,
    code: course.code ?? "",
    description: course.description ?? "",
    objectives: course.objectives ?? "",
    level: course.level,
    language: course.language,
    deliveryMode: course.delivery_mode,
    visibility: course.visibility,
    enrollmentOpensAt: toLocalInput(course.enrollment_opens_at),
    enrollmentClosesAt: toLocalInput(course.enrollment_closes_at),
    startsOn: course.starts_on ?? "",
    endsOn: course.ends_on ?? "",
    estimatedHours: course.estimated_hours?.toString() ?? "",
    capacity: course.capacity?.toString() ?? "",
  };
}

export function CourseDetailsPanel({
  organizationId,
  course,
  prerequisiteOptions,
  selectedPrerequisites,
  canDelete,
}: {
  organizationId: string;
  course: LmsCourse;
  prerequisiteOptions: { id: string; title: string; code: string | null }[];
  selectedPrerequisites: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prereqs, setPrereqs] = useState<string[]>(selectedPrerequisites);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function run(
    action: () => Promise<LmsResult>,
    done?: string,
    after?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action().catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else {
        if (done) setNotice(done);
        after?.();
        router.refresh();
      }
    });
  }

  function status(next: LmsPublishState) {
    run(
      () => setCourseStatusAction(organizationId, course.id, next),
      next === "published"
        ? "Course published."
        : next === "archived"
          ? "Course archived."
          : "Course moved back to draft.",
    );
  }

  function upload(file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("courseId", course.id);
    data.set("image", file);
    run(() => uploadCourseCoverAction(data), "Cover image updated.");
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge
              variant={course.status === "published" ? "default" : "secondary"}
            >
              {course.status}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {course.status !== "published" && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => status("published")}
              >
                Publish
              </Button>
            )}
            {course.status === "published" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => status("draft")}
              >
                Unpublish
              </Button>
            )}
            {course.status !== "archived" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => status("archived")}
              >
                Archive
              </Button>
            )}
            {canDelete && course.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (
                    confirm(
                      `Delete the course "${course.title}"? This can't be undone.`,
                    )
                  )
                    run(
                      () => deleteCourseAction(organizationId, course.id),
                      undefined,
                      () => router.push(`${LMS_BASE_PATH}/courses`),
                    );
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="font-medium">Cover image</p>
          <div className="flex flex-wrap items-center gap-4">
            {course.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.cover_image_url}
                alt=""
                className="h-24 w-40 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-24 w-40 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                No image
              </div>
            )}
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => fileInput.current?.click()}
              >
                {course.cover_image_url ? "Replace image" : "Upload image"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG or WebP, up to 2 MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CourseForm
            initial={courseToInput(course)}
            submitLabel="Save course"
            onSubmit={(input) =>
              updateCourseAction(organizationId, course.id, input)
            }
            onDone={() => router.refresh()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="font-medium">Prerequisites</p>
          {prerequisiteOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no other courses to require yet.
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {prerequisiteOptions.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={prereqs.includes(option.id)}
                    onChange={(e) =>
                      setPrereqs((p) =>
                        e.target.checked
                          ? [...p, option.id]
                          : p.filter((id) => id !== option.id),
                      )
                    }
                  />
                  {option.title}
                  {option.code ? ` (${option.code})` : ""}
                </label>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  setPrerequisitesAction(organizationId, course.id, prereqs),
                "Prerequisites saved.",
              )
            }
          >
            Save prerequisites
          </Button>
          <p className="text-xs text-muted-foreground">
            Students are asked to finish prerequisite courses first. Enforcement
            starts with the student portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
