"use client";

import { useState, useTransition } from "react";
import { GraduationCap } from "lucide-react";
import { setBibleSchoolAccessAction } from "@/lib/lms/access-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

// Super Admin: turn the Bible School on or off for one church, and keep a note of what was agreed.
export function BibleSchoolAccessCard({
  organizationId,
  enabled,
  requestedAt,
  initialNote,
}: {
  organizationId: string;
  enabled: boolean;
  requestedAt: string | null;
  initialNote: string;
}) {
  const [on, setOn] = useState(enabled);
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setBibleSchoolAccessAction(
        organizationId,
        next,
        note,
      ).catch(() => ({ error: "Couldn't save that. Try again." }));
      if (result.error) setMessage(result.error);
      else {
        setOn(next);
        setMessage("Saved.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Bible School</p>
          {on ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}
          {!on && requestedAt && (
            <Badge variant="secondary">
              Requested{" "}
              {new Date(requestedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Badge>
          )}
        </div>
        <Textarea
          rows={2}
          maxLength={1000}
          value={note}
          placeholder="What was agreed, and how it is billed"
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={on ? "outline" : "default"}
            disabled={pending}
            onClick={() => save(!on)}
          >
            {on ? "Turn off" : "Turn on"}
          </Button>
          {on && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => save(true)}
            >
              Save note
            </Button>
          )}
          {message && (
            <span className="text-xs text-muted-foreground">{message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
