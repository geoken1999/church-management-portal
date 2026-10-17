"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCourseAction } from "@/lib/lms/actions";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourseForm, EMPTY_COURSE } from "@/components/bible-school/CourseForm";

export function NewCourse({
  organizationId,
  defaultLanguage,
}: {
  organizationId: string;
  defaultLanguage: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>New course</Button>;
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="font-medium">New course</p>
        <CourseForm
          initial={{ ...EMPTY_COURSE, language: defaultLanguage }}
          submitLabel="Create course"
          onSubmit={(input) => createCourseAction(organizationId, input)}
          onDone={(result) =>
            result.id &&
            router.push(`${LMS_BASE_PATH}/courses/${result.id}?tab=curriculum`)
          }
        />
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </CardContent>
    </Card>
  );
}
