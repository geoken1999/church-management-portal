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
  presetName,
}: {
  mode?: KmeetMode;
  meetingId: string;
  title: string;
  alreadyEnded: boolean;
  // Set when a member joins from the mobile app: their own name, so the name
  // screen is skipped.
  presetName?: string;
}) {
  const [name, setName] = useState(presetName ?? "");
  const [joining, setJoining] = useState(Boolean(presetName?.trim()) && !alreadyEnded);
  const Icon = mode === "audio" ? Headphones : Webcam;

  if (joining) {
    return (
      <div className="fixed inset-0 overflow-auto bg-background p-2 sm:p-3">
        <KmeetCall mode={mode} meetingId={meetingId} title={title} alreadyEnded={alreadyEnded} canEnd={false} guestName={name.trim()} backHref="/" fullScreen />
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
            You&apos;ve been invited to a {mode === "audio" ? "K-Connect audio-only" : "K-Connect video"} call.
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
              {/* On a phone with the KingdomFlow app installed, this opens the call in the app. */}
              <a
                href={`kingdomflow://${mode === "audio" ? "kaudio" : "kmeet"}/${meetingId}`}
                className="block text-center text-sm font-medium text-primary underline-offset-4 hover:underline sm:hidden"
              >
                Open in the KingdomFlow app
              </a>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
