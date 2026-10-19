"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  submitStudentApplication,
  type ApplicationState,
} from "@/lib/lms/student-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

const initial: ApplicationState = {};
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function StudentApplyForm({
  slug,
  courses,
}: {
  slug: string;
  courses: { id: string; title: string; price: number | null }[];
}) {
  const [state, action, pending] = useActionState(
    submitStudentApplication.bind(null, slug),
    initial,
  );

  // A course with a fee: carry on to the payment page.
  useEffect(() => {
    if (state.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state.checkoutUrl]);

  if (state.checkoutUrl) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 py-10 text-center text-sm text-muted-foreground">
        Taking you to the payment page...
      </p>
    );
  }

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 py-10 text-center">
        <CheckCircle2 className="size-9 text-primary" />
        <div className="max-w-sm">
          <p className="font-heading text-lg font-bold">Application sent</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Once you&apos;re approved, install the KingdomFlow app and sign in
            with the mobile number you used here. Your courses will be waiting.
          </p>
        </div>
      </div>
    );
  }

  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ErrorToast message={state.error} />
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stu-first">First name</Label>
          <Input
            id="stu-first"
            name="firstName"
            autoComplete="given-name"
            aria-invalid={Boolean(e.firstName)}
          />
          <FieldError id="stu-first-error" message={e.firstName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stu-last">Last name</Label>
          <Input
            id="stu-last"
            name="lastName"
            autoComplete="family-name"
            aria-invalid={Boolean(e.lastName)}
          />
          <FieldError id="stu-last-error" message={e.lastName} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stu-phone">Mobile number</Label>
          <Input
            id="stu-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="10-digit number"
            aria-invalid={Boolean(e.phone)}
          />
          <FieldError id="stu-phone-error" message={e.phone} />
          <p className="text-xs text-muted-foreground">
            You&apos;ll sign in to the app with this number, so use one you can
            receive a code on.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stu-email">Email (optional)</Label>
          <Input
            id="stu-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(e.email)}
          />
          <FieldError id="stu-email-error" message={e.email} />
        </div>
      </div>
      {courses.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="stu-course">Course you would like to take</Label>
          <select
            id="stu-course"
            name="courseId"
            defaultValue=""
            className={SELECT_CLASS}
          >
            <option value="">Not sure yet</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.price ? ` (₹${c.price})` : ""}
              </option>
            ))}
          </select>
          <FieldError id="stu-course-error" message={e.courseId} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="stu-message">
          Anything you would like us to know (optional)
        </Label>
        <Textarea
          id="stu-message"
          name="message"
          rows={3}
          maxLength={500}
          aria-invalid={Boolean(e.message)}
        />
        <FieldError id="stu-message-error" message={e.message} />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Please wait..." : "Apply to join"}
      </Button>
    </form>
  );
}
