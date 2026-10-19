"use client";

import { useState, useTransition } from "react";
import {
  COURSE_LEVELS,
  DELIVERY_MODES,
  VISIBILITIES,
} from "@/lib/lms/constants";
import type { CourseInput } from "@/lib/lms/validation";
import type { LmsResult } from "@/lib/lms/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const EMPTY_COURSE: CourseInput = {
  title: "",
  code: "",
  description: "",
  objectives: "",
  level: "beginner",
  language: "en",
  deliveryMode: "self_paced",
  visibility: "organization",
  enrollmentOpensAt: "",
  enrollmentClosesAt: "",
  startsOn: "",
  endsOn: "",
  estimatedHours: "",
  capacity: "",
};

export function CourseForm({
  initial,
  submitLabel,
  onSubmit,
  onDone,
}: {
  initial: CourseInput;
  submitLabel: string;
  onSubmit: (input: CourseInput) => Promise<LmsResult>;
  onDone?: (result: LmsResult) => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set =
    (key: keyof CourseInput) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setSaved(false);
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await onSubmit(form).catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else {
        setSaved(true);
        onDone?.(result);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorToast message={error} />
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1.5">
          <Label htmlFor="course-title">Title</Label>
          <Input
            id="course-title"
            value={form.title}
            onChange={set("title")}
            maxLength={120}
            placeholder="Bible Foundations"
          />
          <FieldError id="course-title-error" message={errors.title} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-code">Code (optional)</Label>
          <Input
            id="course-code"
            value={form.code}
            onChange={set("code")}
            maxLength={20}
            placeholder="BF-101"
          />
          <FieldError id="course-code-error" message={errors.code} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="course-description">Description</Label>
        <Textarea
          id="course-description"
          rows={3}
          value={form.description}
          onChange={set("description")}
          maxLength={4000}
        />
        <FieldError
          id="course-description-error"
          message={errors.description}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-objectives">Learning objectives</Label>
        <Textarea
          id="course-objectives"
          rows={3}
          value={form.objectives}
          onChange={set("objectives")}
          maxLength={4000}
          placeholder="What a student will be able to do after this course"
        />
        <FieldError id="course-objectives-error" message={errors.objectives} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="course-level">Level</Label>
          <select
            id="course-level"
            value={form.level}
            onChange={set("level")}
            className={SELECT_CLASS}
          >
            {COURSE_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-mode">Delivery</Label>
          <select
            id="course-mode"
            value={form.deliveryMode}
            onChange={set("deliveryMode")}
            className={SELECT_CLASS}
          >
            {DELIVERY_MODES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-language">Language</Label>
          <Input
            id="course-language"
            value={form.language}
            onChange={set("language")}
            maxLength={30}
          />
          <FieldError id="course-language-error" message={errors.language} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-visibility">Visible to</Label>
          <select
            id="course-visibility"
            value={form.visibility}
            onChange={set("visibility")}
            className={SELECT_CLASS}
          >
            {VISIBILITIES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="course-enroll-opens">
            Enrollment opens (optional)
          </Label>
          <Input
            id="course-enroll-opens"
            type="datetime-local"
            value={form.enrollmentOpensAt}
            onChange={set("enrollmentOpensAt")}
          />
          <FieldError
            id="course-enroll-opens-error"
            message={errors.enrollmentOpensAt}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-enroll-closes">
            Enrollment closes (optional)
          </Label>
          <Input
            id="course-enroll-closes"
            type="datetime-local"
            value={form.enrollmentClosesAt}
            onChange={set("enrollmentClosesAt")}
          />
          <FieldError
            id="course-enroll-closes-error"
            message={errors.enrollmentClosesAt}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="course-starts">Starts (optional)</Label>
          <Input
            id="course-starts"
            type="date"
            value={form.startsOn}
            onChange={set("startsOn")}
          />
          <FieldError id="course-starts-error" message={errors.startsOn} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-ends">Ends (optional)</Label>
          <Input
            id="course-ends"
            type="date"
            value={form.endsOn}
            onChange={set("endsOn")}
          />
          <FieldError id="course-ends-error" message={errors.endsOn} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-hours">Estimated hours</Label>
          <Input
            id="course-hours"
            type="number"
            min={0}
            step="0.5"
            value={form.estimatedHours}
            onChange={set("estimatedHours")}
          />
          <FieldError id="course-hours-error" message={errors.estimatedHours} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-capacity">Seats (blank = no limit)</Label>
          <Input
            id="course-capacity"
            type="number"
            min={1}
            step="1"
            value={form.capacity}
            onChange={set("capacity")}
          />
          <FieldError id="course-capacity-error" message={errors.capacity} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </form>
  );
}
