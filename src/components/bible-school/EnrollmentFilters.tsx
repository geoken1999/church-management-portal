"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { ENROLLMENT_LABELS, ENROLLMENT_STATUSES } from "@/lib/lms/constants";
import { Button } from "@/components/ui/button";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function EnrollmentFilters({
  courseId,
  status,
  courses,
}: {
  courseId: string;
  status: string;
  courses: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [course, setCourse] = useState(courseId);
  const [state, setState] = useState(status);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (course) params.set("course", course);
    if (state) params.set("status", state);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
      <select
        value={course}
        onChange={(e) => setCourse(e.target.value)}
        className={SELECT_CLASS}
        aria-label="Course"
      >
        <option value="">All courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className={SELECT_CLASS}
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {ENROLLMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ENROLLMENT_LABELS[s]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
    </form>
  );
}
