"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteProgramAction,
  saveProgramAction,
  setProgramCoursesAction,
  setProgramStatusAction,
  type LmsResult,
} from "@/lib/lms/actions";
import type { ProgramRow } from "@/lib/lms/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

interface CourseOption {
  id: string;
  title: string;
  code: string | null;
}

export function ProgramsManager({
  organizationId,
  programs,
  courses,
  canDelete,
}: {
  organizationId: string;
  programs: ProgramRow[];
  courses: CourseOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    objectives: "",
    price: "",
    capacity: "",
    visibility: "organization",
  });
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  function run(action: () => Promise<LmsResult>, after?: () => void) {
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await action().catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const courseName = (id: string) =>
    courses.find((c) => c.id === id)?.title ?? "Unknown course";

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {editing === null && (
        <Button
          onClick={() => {
            setForm({
              title: "",
              description: "",
              objectives: "",
              price: "",
              capacity: "",
              visibility: "organization",
            });
            setEditing("new");
          }}
        >
          New program
        </Button>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">
              {editing === "new" ? "New program" : "Edit program"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="program-title">Name</Label>
              <Input
                id="program-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                maxLength={120}
                placeholder="Christian Leadership"
              />
              <FieldError id="program-title-error" message={errors.title} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-description">Description</Label>
              <Textarea
                id="program-description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                maxLength={4000}
              />
              <FieldError
                id="program-description-error"
                message={errors.description}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-objectives">Learning objectives</Label>
              <Textarea
                id="program-objectives"
                rows={3}
                value={form.objectives}
                onChange={(e) =>
                  setForm((f) => ({ ...f, objectives: e.target.value }))
                }
                maxLength={4000}
              />
              <FieldError
                id="program-objectives-error"
                message={errors.objectives}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="program-price">
                  Program fee in ₹ (blank = free)
                </Label>
                <Input
                  id="program-price"
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
                <FieldError id="program-price-error" message={errors.price} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="program-capacity">
                  Seats (blank = no limit)
                </Label>
                <Input
                  id="program-capacity"
                  type="number"
                  min={1}
                  step="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: e.target.value }))
                  }
                />
                <FieldError
                  id="program-capacity-error"
                  message={errors.capacity}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="program-visibility">Who can join</Label>
                <select
                  id="program-visibility"
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  value={form.visibility}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, visibility: e.target.value }))
                  }
                >
                  <option value="organization">Church members only</option>
                  <option value="public">
                    Open to the public (shown on your Bible School page)
                  </option>
                </select>
                <FieldError
                  id="program-visibility-error"
                  message={errors.visibility}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Students join and pay for the whole program, and are enrolled in
              every course in it. Paid online on KingdomFlow with a 2.5% service
              fee; you request payouts from the Payouts page.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      saveProgramAction(
                        organizationId,
                        editing === "new" ? null : editing,
                        form,
                      ),
                    () => setEditing(null),
                  )
                }
              >
                {pending ? "Saving..." : "Save program"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {programs.length === 0 && editing === null && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No programs yet. A program groups related courses, like Old
            Testament Studies.
          </CardContent>
        </Card>
      )}

      {programs.map((program) => (
        <Card key={program.id}>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{program.title}</span>
                <Badge
                  variant={
                    program.status === "published" ? "default" : "secondary"
                  }
                >
                  {program.status}
                </Badge>
                {program.pendingCount > 0 && (
                  <Badge variant="destructive">
                    {program.pendingCount} waiting
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      title: program.title,
                      description: program.description ?? "",
                      objectives: program.objectives ?? "",
                      price: program.price_amount?.toString() ?? "",
                      capacity: program.capacity?.toString() ?? "",
                      visibility: program.visibility,
                    });
                    setEditing(program.id);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/dashboard/bible-school/programs/${program.id}`}
                    >
                      Enrollments
                    </Link>
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPicking(picking === program.id ? null : program.id);
                    setPicked(program.courseIds);
                  }}
                >
                  Courses
                </Button>
                {program.status !== "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setProgramStatusAction(
                          organizationId,
                          program.id,
                          "published",
                        ),
                      )
                    }
                  >
                    Publish
                  </Button>
                )}
                {program.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setProgramStatusAction(
                          organizationId,
                          program.id,
                          "draft",
                        ),
                      )
                    }
                  >
                    Unpublish
                  </Button>
                )}
                {program.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setProgramStatusAction(
                          organizationId,
                          program.id,
                          "archived",
                        ),
                      )
                    }
                  >
                    Archive
                  </Button>
                )}
                {canDelete && program.status !== "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete the program "${program.title}"? Its courses are kept.`,
                        )
                      )
                        run(() =>
                          deleteProgramAction(organizationId, program.id),
                        );
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
            {program.description && (
              <p className="text-sm text-muted-foreground">
                {program.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {program.price_amount ? `Fee ₹${program.price_amount}` : "Free"}
              {program.capacity ? ` · ${program.capacity} seats` : ""} ·{" "}
              {program.visibility === "public"
                ? "Open to the public"
                : "Church members only"}
            </p>
            <p className="text-xs text-muted-foreground">
              {program.courseIds.length === 0
                ? "No courses in this program yet."
                : `Courses: ${program.courseIds.map(courseName).join(" → ")}`}
            </p>

            {picking === program.id && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <p className="text-sm font-medium">
                  Courses in this program (in the order you tick them)
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {courses.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(c.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked
                              ? [...p, c.id]
                              : p.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.title}
                      {c.code ? ` (${c.code})` : ""}
                    </label>
                  ))}
                  {courses.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Create courses first.
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        setProgramCoursesAction(
                          organizationId,
                          program.id,
                          picked,
                        ),
                      () => setPicking(null),
                    )
                  }
                >
                  Save courses
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
