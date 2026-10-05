"use client";

import { useState } from "react";
import { Webcam, Headphones } from "lucide-react";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";
import type { KmeetMode } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function KmeetGuestJoin({
  mode = "video",
  meetingId,
  title,
  alreadyEnded,
}: {
  mode?: KmeetMode;
  meetingId: string;
  title: string;
  alreadyEnded: boolean;
}) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const Icon = mode === "audio" ? Headphones : Webcam;

  if (joining) {
    return (
      <div className="min-h-screen bg-background p-4">
        <KmeetCall mode={mode} meetingId={meetingId} title={title} alreadyEnded={alreadyEnded} canEnd={false} guestName={name.trim()} backHref="/" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>
            You&apos;ve been invited to a {mode === "audio" ? "K-Audio audio-only" : "K-Meet video"} call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadyEnded ? (
            <Alert variant="destructive">
              <AlertDescription>This meeting has already ended.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="guest-name">Your name</Label>
                <Input
                  id="guest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) setJoining(true);
                  }}
                  autoFocus
                />
              </div>
              <Button type="button" className="w-full" disabled={!name.trim()} onClick={() => setJoining(true)}>
                Join meeting
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
