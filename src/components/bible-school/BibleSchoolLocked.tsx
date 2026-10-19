"use client";

import { useState, useTransition } from "react";
import { GraduationCap, Check } from "lucide-react";
import { requestBibleSchoolAccessAction } from "@/lib/lms/access-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

const FEATURES = [
  "Courses with modules and lessons: reading, video, audio, documents and links",
  "Members watch video and audio inside the app, with their progress tracked",
  "Live classes in K-Connect with attendance and reminders",
  "Open selected courses to people outside your church, with your team approving who joins",
];

// What a church sees when live streaming isn't turned on for it: what it is, and a way to ask.
export function BibleSchoolLocked({
  requestedAt,
  canRequest,
}: {
  requestedAt: string | null;
  canRequest: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const asked = sent || requestedAt !== null;

  function request() {
    setError(null);
    startTransition(async () => {
      const result = await requestBibleSchoolAccessAction(message).catch(
        () => ({
          error: "Something went wrong. Check your connection and try again.",
          success: false,
        }),
      );
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-5" />
          The Bible School is set up for you by request
        </CardTitle>
        <CardDescription>
          We set it up with you so it works well for your church, and any extra
          cost is agreed with you first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        <ErrorToast message={error} />

        {asked ? (
          <Alert>
            <AlertDescription className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" />
              <span>
                {sent || !requestedAt
                  ? "Request sent."
                  : `You asked on ${new Date(requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`}{" "}
                We&apos;ll be in touch to set it up. You&apos;ll see the Bible
                School here as soon as it&apos;s on.
              </span>
            </AlertDescription>
          </Alert>
        ) : canRequest ? (
          <div className="space-y-3">
            <Textarea
              rows={3}
              maxLength={1000}
              value={message}
              placeholder="Anything we should know? For example how many students and courses you plan to start with (optional)"
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button type="button" disabled={pending} onClick={request}>
              {pending ? "Sending…" : "Contact us to enable"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an owner or admin of your church to request the Bible School.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
