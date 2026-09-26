"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { addEventToAttendance } from "@/lib/attendance/actions";
import { Button } from "@/components/ui/button";

// Creates (or reuses, if one's already there for today/this event's date)
// an Attendance session for this event, then takes the organizer straight
// to it — where its online registrants already show up as a check-in
// checklist (see AttendanceSessionDetail). Saves a trip to Attendance to
// create a session and pick this event out of its dropdown by hand.
export function AddToAttendanceButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await addEventToAttendance(eventId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.sessionId) {
        router.push(`/dashboard/attendance/${result.sessionId}`);
      }
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleClick}>
        <ClipboardCheck className="size-3.5" />
        {pending ? "Adding..." : "Add to Attendance"}
      </Button>
      {error && <p className="absolute top-full right-0 z-10 mt-1 w-48 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
