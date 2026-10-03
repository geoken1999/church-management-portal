"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MeetingProvider, MeetingConsumer, useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, ScreenShareOff, PhoneOff, Loader2, Link as LinkIcon, Check } from "lucide-react";
import { joinMeetingAction, joinMeetingAsGuestAction, endMeetingAction } from "@/lib/kmeet/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// A participant's video (via VideoPlayer-equivalent rendering below) and
// audio are separate concerns in this SDK — video goes through a <video>
// element bound to webcamStream, audio is wired manually to an <audio>
// element the same way VideoSDK's own reference implementation does
// (construct a fresh MediaStream from the track, since the SDK doesn't
// auto-play audio for you).
function ParticipantTile({ participantId }: { participantId: string }) {
  const { displayName, webcamOn, webcamStream, micOn, micStream, isLocal, screenShareOn, screenShareStream } = useParticipant(participantId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (webcamOn && webcamStream) {
      const mediaStream = new MediaStream([webcamStream.track]);
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [webcamOn, webcamStream]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (micOn && micStream && !isLocal) {
      const mediaStream = new MediaStream([micStream.track]);
      audioRef.current.srcObject = mediaStream;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.srcObject = null;
    }
  }, [micOn, micStream, isLocal]);

  useEffect(() => {
    if (!screenRef.current) return;
    if (screenShareOn && screenShareStream) {
      const mediaStream = new MediaStream([screenShareStream.track]);
      screenRef.current.srcObject = mediaStream;
      screenRef.current.play().catch(() => {});
    } else {
      screenRef.current.srcObject = null;
    }
  }, [screenShareOn, screenShareStream]);

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
      {screenShareOn ? (
        <video ref={screenRef} autoPlay playsInline className="h-full w-full object-contain" />
      ) : webcamOn ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} className="h-full w-full object-cover" />
      ) : (
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {(displayName || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <audio ref={audioRef} autoPlay />
      <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {displayName || "Guest"}
        {isLocal ? " (you)" : ""}
        {!micOn && " · muted"}
      </div>
    </div>
  );
}

function CopyInviteLinkButton({ meetingId }: { meetingId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/kmeet/${meetingId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="size-3.5" /> : <LinkIcon className="size-3.5" />}
      {copied ? "Copied" : "Invite link"}
    </Button>
  );
}

function CallControls({ meetingId, canEnd, onLeft }: { meetingId: string; canEnd: boolean; onLeft: () => void }) {
  const { leave, end, toggleMic, toggleWebcam, toggleScreenShare, localMicOn, localWebcamOn, localScreenShareOn } = useMeeting();

  function handleLeave() {
    leave();
    onLeft();
  }

  function handleEnd() {
    if (!window.confirm("End this meeting for everyone?")) return;
    end();
    endMeetingAction(meetingId);
    onLeft();
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border bg-background p-3">
      <Button type="button" variant={localMicOn ? "outline" : "destructive"} size="icon" onClick={() => toggleMic()} title={localMicOn ? "Mute" : "Unmute"}>
        {localMicOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </Button>
      <Button type="button" variant={localWebcamOn ? "outline" : "destructive"} size="icon" onClick={() => toggleWebcam()} title={localWebcamOn ? "Turn off camera" : "Turn on camera"}>
        {localWebcamOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
      </Button>
      <Button type="button" variant={localScreenShareOn ? "default" : "outline"} size="icon" onClick={() => toggleScreenShare()} title="Share your screen">
        {localScreenShareOn ? <ScreenShareOff className="size-4" /> : <ScreenShare className="size-4" />}
      </Button>
      <CopyInviteLinkButton meetingId={meetingId} />
      <Button type="button" variant="destructive" onClick={handleLeave}>
        <PhoneOff className="size-4" />
        Leave
      </Button>
      {canEnd && (
        <Button type="button" variant="ghost" onClick={handleEnd}>
          End for everyone
        </Button>
      )}
    </div>
  );
}

function CallView({ meetingId, canEnd, onLeft }: { meetingId: string; canEnd: boolean; onLeft: () => void }) {
  const [joined, setJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const retriedRef = useRef(false);

  const { join, participants } = useMeeting({
    onMeetingJoined: () => setJoined(true),
    onError: (data: { code: string; message: string }) => {
      // code 4002 (INVALID_TOKEN) right at the start is almost always this
      // SDK's own config effect (a parent effect) not having run yet when
      // join() fires from a child effect — React runs effects child-first
      // within a commit, so the very first join() can race ahead of it.
      // One retry, a tick later, is enough; a second 4002 is a genuine bad
      // token, not a timing issue.
      if (data.code === "4002" && !joined && !retriedRef.current) {
        retriedRef.current = true;
        setTimeout(() => join(), 150);
        return;
      }
      console.error("VideoSDK error:", data);
      setConnectionError(data.message || "Something went wrong with the call connection.");
    },
  });

  useEffect(() => {
    // Deferred to a macrotask so this runs after every effect from this
    // commit (including the SDK's own MeetingProvider config effect, a
    // parent effect that otherwise hasn't necessarily run yet) — see the
    // onError comment above for why calling join() synchronously here
    // raced ahead of it.
    const timer = setTimeout(() => join(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const participantIds = [...participants.keys()];

  if (connectionError && !joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>Couldn&apos;t connect to the call: {connectionError}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={onLeft}>
          Back to K-meet
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {connectionError && (
        <Alert variant="destructive" className="m-2">
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {!joined || participantIds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Connecting to the call...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participantIds.map((id) => (
              <ParticipantTile key={id} participantId={id} />
            ))}
          </div>
        )}
      </div>
      <CallControls meetingId={meetingId} canEnd={canEnd} onLeft={onLeft} />
    </div>
  );
}

export interface KmeetCallProps {
  meetingId: string;
  title: string;
  alreadyEnded: boolean;
  canEnd: boolean;
  // Dashboard members join via joinMeetingAction (requires a session);
  // the public /kmeet/[meetingId] page passes guestName instead, which
  // routes through joinMeetingAsGuestAction (no session needed) — the
  // call itself is identical either way.
  guestName?: string;
  backHref: string;
}

export function KmeetCall({ meetingId, title, alreadyEnded, canEnd, guestName, backHref }: KmeetCallProps) {
  const router = useRouter();
  const [joinInfo, setJoinInfo] = useState<{ roomId: string; token: string; displayName: string } | null>(null);
  const [error, setError] = useState<string | null>(alreadyEnded ? "This meeting has already ended." : null);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    if (alreadyEnded) return;
    const join = guestName ? joinMeetingAsGuestAction(meetingId, guestName) : joinMeetingAction(meetingId);
    join.then((result) => {
      if (result.error || !result.roomId || !result.token) {
        setError(result.error ?? "Couldn't join this meeting.");
        return;
      }
      setJoinInfo({ roomId: result.roomId, token: result.token, displayName: result.displayName ?? "Guest" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, alreadyEnded]);

  function handleLeft() {
    setLeft(true);
    router.push(backHref);
  }

  if (left) return null;

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
          Back
        </Button>
      </div>
    );
  }

  if (!joinInfo) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        Preparing your meeting...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-lg border border-border">
      <MeetingProvider config={{ meetingId: joinInfo.roomId, micEnabled: true, webcamEnabled: true, name: joinInfo.displayName, debugMode: false }} token={joinInfo.token}>
        <MeetingConsumer>{() => <CallView meetingId={meetingId} canEnd={canEnd} onLeft={handleLeft} />}</MeetingConsumer>
      </MeetingProvider>
    </div>
  );
}
