"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MeetingProvider, useMeeting, useParticipant, usePubSub } from "@videosdk.live/react-sdk";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  Loader2,
  Link as LinkIcon,
  Check,
  MessageSquare,
  Send,
  UserX,
  ShieldCheck,
  ShieldAlert,
  Clock,
  X,
} from "lucide-react";
import { joinMeetingAction, joinMeetingAsGuestAction, endMeetingAction, toggleAdmissionModeAction } from "@/lib/kmeet/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const REACTIONS = ["👍", "❤️", "😂", "👏", "🎉"];

// A video tile's aspect ratio follows the camera's actual orientation
// rather than the viewer's own window width — a phone's camera renders
// portrait regardless of how wide the person looking at it has their
// browser, and vice versa. Read from the <video> element's own decoded
// videoWidth/videoHeight (via the loadedmetadata event) rather than
// MediaStreamTrack.getSettings(): settings reports the sensor's raw
// capture resolution, which several mobile browsers (confirmed on real
// devices, not just this app's own testing) report in landscape terms
// even when the phone is held upright and the frame is actually rotated
// before being handed to WebRTC — videoWidth/videoHeight reflects what
// the browser actually decodes and displays, the only number that
// matches what a viewer will really see.
function useVideoOrientation(videoRef: React.RefObject<HTMLVideoElement | null>, deps: readonly unknown[]): "portrait" | "landscape" {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function handleLoadedMetadata() {
      if (video && video.videoWidth && video.videoHeight) {
        setOrientation(video.videoHeight > video.videoWidth ? "portrait" : "landscape");
      }
    }
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return orientation;
}

// A participant's video and audio are separate concerns in this SDK —
// video goes through a <video> element bound to webcamStream, audio is
// wired manually to an <audio> element the same way VideoSDK's own
// reference implementation does (construct a fresh MediaStream from the
// track, since the SDK doesn't auto-play audio for you).
function ParticipantTile({ participantId, isModerator }: { participantId: string; isModerator: boolean }) {
  const { displayName, webcamOn, webcamStream, micOn, micStream, isLocal, screenShareOn, screenShareStream, disableMic, disableWebcam, remove } =
    useParticipant(participantId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const orientation = useVideoOrientation(videoRef, [webcamStream]);

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

  const showModControls = isModerator && !isLocal;
  // Every tile stays a uniform landscape cell — a grid that resizes one
  // cell into a tall portrait box per participant looks broken next to
  // everyone else's, the opposite of what real video-calling apps do (a
  // consistent grid regardless of who's on mobile vs. desktop). A
  // portrait camera is fit *inside* that landscape cell with
  // object-contain instead — the full portrait frame stays visible,
  // centered, rather than being cropped top/bottom by object-cover or the
  // whole cell being resized around it.
  const videoFitClass = orientation === "portrait" ? "object-contain" : "object-cover";

  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
      {screenShareOn ? (
        <video ref={screenRef} autoPlay playsInline className="h-full w-full object-contain" />
      ) : webcamOn ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`h-full w-full ${videoFitClass}`} />
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
      {showModControls && (
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {micOn && (
            <button
              type="button"
              onClick={() => disableMic()}
              title={`Mute ${displayName}`}
              className="flex size-6 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
            >
              <MicOff className="size-3.5" />
            </button>
          )}
          {webcamOn && (
            <button
              type="button"
              onClick={() => disableWebcam()}
              title={`Turn off ${displayName}'s camera`}
              className="flex size-6 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
            >
              <VideoOff className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove ${displayName} from the meeting?`)) remove();
            }}
            title={`Remove ${displayName}`}
            className="flex size-6 items-center justify-center rounded bg-black/60 text-white hover:bg-destructive"
          >
            <UserX className="size-3.5" />
          </button>
        </div>
      )}
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

// basic/premium limit the call length (20/40 minutes); pro has none.
// startedAt is locked in the moment the room was actually created, so a
// mid-call plan change never shifts an already-visible countdown.
function CallTimer({ startedAt, maxDurationMinutes, onExpire }: { startedAt: string; maxDurationMinutes: number | null; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const endsAt = maxDurationMinutes ? new Date(startedAt).getTime() + maxDurationMinutes * 60_000 : null;
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : null;

  useEffect(() => {
    if (!maxDurationMinutes) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [maxDurationMinutes]);

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire();
    }
  }, [remainingMs, onExpire]);

  if (!maxDurationMinutes || remainingMs === null) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        Unlimited
      </span>
    );
  }

  const remainingSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const low = remainingSeconds <= 60;

  return (
    <span className={`flex items-center gap-1 text-xs ${low ? "font-medium text-destructive" : "text-muted-foreground"}`}>
      <Clock className="size-3.5" />
      {minutes}:{seconds.toString().padStart(2, "0")} left
    </span>
  );
}

interface ChatMessage {
  id: string;
  message: string;
  senderName: string;
  timestamp: string;
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const { publish, messages } = usePubSub("CHAT");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    publish(trimmed, { persist: true });
    setDraft("");
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col border-l border-border bg-background sm:static sm:inset-auto sm:z-auto sm:h-full sm:w-72 sm:shrink-0">
      <div className="flex items-center justify-between border-b border-border p-2">
        <p className="text-sm font-medium">Chat</p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-2">
        {(messages as ChatMessage[]).length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No messages yet.</p>
        ) : (
          (messages as ChatMessage[]).map((m) => (
            <div key={m.id} className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">{m.senderName}</p>
              <p className="whitespace-pre-wrap">{m.message}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message everyone..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <Button type="button" size="icon" onClick={handleSend} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function FloatingReactions() {
  const [burst, setBurst] = useState<{ id: string; emoji: string; from: string }[]>([]);

  usePubSub("REACTIONS", {
    onMessageReceived: (msg) => {
      setBurst((prev) => [...prev, { id: msg.id, emoji: msg.message, from: msg.senderName }]);
      setTimeout(() => setBurst((prev) => prev.filter((b) => b.id !== msg.id)), 2500);
    },
  });

  if (burst.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-4 bottom-20 flex flex-col items-end gap-1">
      {burst.map((b) => (
        <div key={b.id} className="animate-bounce rounded-full bg-black/60 px-2 py-1 text-sm text-white">
          {b.emoji} <span className="text-xs opacity-80">{b.from}</span>
        </div>
      ))}
    </div>
  );
}

function ReactionBar() {
  const { publish } = usePubSub("REACTIONS");
  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => publish(emoji, { persist: false })}
          className="rounded px-1 text-base hover:bg-muted"
          title={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface EntryRequest {
  participantId: string;
  name: string;
  allow: () => void;
  deny: () => void;
}

function CallControls({
  meetingId,
  canEnd,
  isModerator,
  requireAdmission,
  onToggleAdmission,
  chatOpen,
  onToggleChat,
  onLeft,
}: {
  meetingId: string;
  canEnd: boolean;
  isModerator: boolean;
  requireAdmission: boolean;
  onToggleAdmission: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onLeft: () => void;
}) {
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
      <ReactionBar />
      <Button type="button" variant={chatOpen ? "default" : "outline"} size="icon" onClick={onToggleChat} title="Chat">
        <MessageSquare className="size-4" />
      </Button>
      <CopyInviteLinkButton meetingId={meetingId} />
      {isModerator && (
        <Button type="button" variant="outline" size="sm" onClick={onToggleAdmission} title="Toggle whether new joiners need to be admitted">
          {requireAdmission ? <ShieldAlert className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          {requireAdmission ? "Admission required" : "Open for all"}
        </Button>
      )}
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

function CallView({
  meetingId,
  canEnd,
  isModerator,
  initialRequireAdmission,
  startedAt,
  maxDurationMinutes,
  cameraId,
  micId,
  onLeft,
}: {
  meetingId: string;
  canEnd: boolean;
  isModerator: boolean;
  initialRequireAdmission: boolean;
  startedAt: string;
  maxDurationMinutes: number | null;
  cameraId: string;
  micId: string;
  onLeft: () => void;
}) {
  const [joined, setJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deniedEntry, setDeniedEntry] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<EntryRequest[]>([]);
  const [requireAdmission, setRequireAdmission] = useState(initialRequireAdmission);
  const [chatOpen, setChatOpen] = useState(false);
  const retriedRef = useRef(false);
  const deviceAppliedRef = useRef(false);

  const { join, leave, end, participants, changeWebcam, changeMic } = useMeeting({
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

  // Switches to the specific camera/mic chosen in the pre-join lobby —
  // deferred until after a successful join (rather than passed as a
  // custom track at join time) since VideoSDK's own produce pipeline only
  // reliably accepts tracks it created itself via changeWebcam/changeMic,
  // not an externally-supplied MediaStream (confirmed live:
  // ERROR_WEBCAM_PRODUCE_FAILED when attempted at join time).
  useEffect(() => {
    if (!joined || deviceAppliedRef.current) return;
    deviceAppliedRef.current = true;
    if (cameraId) changeWebcam(cameraId).catch(() => {});
    if (micId) changeMic(micId).catch(() => {});
  }, [joined, cameraId, micId, changeWebcam, changeMic]);

  function handleToggleAdmission() {
    const next = !requireAdmission;
    setRequireAdmission(next);
    toggleAdmissionModeAction(meetingId, next);
  }

  function handleExpire() {
    if (isModerator) {
      end();
      endMeetingAction(meetingId);
    } else {
      leave();
    }
    onLeft();
  }

  const participantIds = [...participants.keys()];

  if (deniedEntry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>The host didn&apos;t admit you to this meeting.</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={onLeft}>
          Back
        </Button>
      </div>
    );
  }

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
    <EntryRequestListener
      isModerator={isModerator}
      onRequest={(req) => setPendingRequests((prev) => [...prev, req])}
      onResolved={(participantId) => setPendingRequests((prev) => prev.filter((r) => r.participantId !== participantId))}
      onDenied={() => setDeniedEntry(true)}
    >
      <div className="flex h-full flex-col">
        {connectionError && (
          <Alert variant="destructive" className="m-2">
            <AlertDescription>{connectionError}</AlertDescription>
          </Alert>
        )}
        {isModerator && pendingRequests.length > 0 && (
          <div className="space-y-1 border-b border-border bg-accent/50 p-2">
            {pendingRequests.map((req) => (
              <div key={req.participantId} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{req.name}</strong> wants to join
                </span>
                <div className="flex gap-1">
                  <Button type="button" size="sm" onClick={req.allow}>
                    Admit
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={req.deny}>
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-3 border-b border-border px-3 py-1.5">
          <CallTimer startedAt={startedAt} maxDurationMinutes={maxDurationMinutes} onExpire={handleExpire} />
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto p-4">
            {!joined || participantIds.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                {requireAdmission && !isModerator ? "Waiting for the host to let you in..." : "Connecting to the call..."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {participantIds.map((id) => (
                  <ParticipantTile key={id} participantId={id} isModerator={isModerator} />
                ))}
              </div>
            )}
            <FloatingReactions />
          </div>
          {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
        </div>
        <CallControls
          meetingId={meetingId}
          canEnd={canEnd}
          isModerator={isModerator}
          requireAdmission={requireAdmission}
          onToggleAdmission={handleToggleAdmission}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((v) => !v)}
          onLeft={onLeft}
        />
      </div>
    </EntryRequestListener>
  );
}

// A separate component (rather than adding these callbacks to CallView's
// own useMeeting() call) purely so its props stay stable without an extra
// dependency array to maintain. onEntryRequested only ever fires to
// participants who already have allow_join — i.e. only moderators in an
// admission-required room (everyone else there has ask_join) — so no
// extra isModerator check is strictly needed to decide who sees requests,
// but it's checked anyway as a defensive no-op guard.
function EntryRequestListener({
  isModerator,
  onRequest,
  onResolved,
  onDenied,
  children,
}: {
  isModerator: boolean;
  onRequest: (req: EntryRequest) => void;
  onResolved: (participantId: string) => void;
  onDenied: () => void;
  children: React.ReactNode;
}) {
  useMeeting({
    onEntryRequested: ({ participantId, name, allow, deny }) => {
      if (!isModerator) return;
      onRequest({
        participantId,
        name,
        allow: () => {
          allow();
          onResolved(participantId);
        },
        deny: () => {
          deny();
          onResolved(participantId);
        },
      });
    },
    onEntryResponded: ({ decision }) => {
      if (decision && decision !== "allowed") onDenied();
    },
  });
  return <>{children}</>;
}

export interface LobbyChoice {
  micOn: boolean;
  camOn: boolean;
  cameraId: string;
  micId: string;
}

// A camera-preview "green room" before actually joining — check your mic/
// camera and pick a device while the join request resolves in the
// background, rather than being dropped straight into a live call. Only
// the device IDs and on/off choice carry over to the live call (via
// useMeeting's changeWebcam/changeMic once joined, see CallView) — the
// preview's own getUserMedia stream is always stopped once this unmounts,
// never handed off directly. An earlier version tried handing the raw
// MediaStream straight to MeetingProvider's customCameraVideoTrack config;
// confirmed live that VideoSDK's internal track handling doesn't tolerate
// a track it didn't create itself (ERROR_WEBCAM_PRODUCE_FAILED), so this
// lets the SDK create its own track as it always has and just points it
// at the chosen device afterward.
function PreJoinLobby({ title, canJoin, onJoin }: { title: string; canJoin: boolean; onJoin: (choice: LobbyChoice) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const orientation = useVideoOrientation(videoRef, [stream]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Acquire and release live in the SAME effect, closing over the exact
  // stream this particular effect invocation created — not a separate
  // mount-only cleanup effect reading a shared ref. React 18 Strict Mode
  // runs every effect through mount -> cleanup -> mount once in dev, and a
  // getUserMedia stream can't tolerate that: a shared-ref cleanup stops
  // whatever the ref currently points to, which during that simulated
  // cleanup can be a stream a *different* invocation is still using.
  // This stream is only ever used for the lobby's own preview — it's
  // always released on unmount, never hand off to the live call itself
  // (see the LobbyChoice comment above for why).
  useEffect(() => {
    let cancelled = false;
    let acquiredStream: MediaStream | null = null;

    async function startPreview() {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
          audio: micId ? { deviceId: { exact: micId } } : true,
        });
        if (cancelled) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        acquiredStream = newStream;
        streamRef.current = newStream;
        setStream(newStream);
        setPermissionError(null);

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(devices.filter((d) => d.kind === "videoinput"));
        setMics(devices.filter((d) => d.kind === "audioinput"));
      } catch {
        if (!cancelled) setPermissionError("Couldn't access your camera or microphone — check your browser's permission settings for this site.");
      }
    }

    startPreview();
    return () => {
      cancelled = true;
      acquiredStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraId, micId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camOn ? stream : null;
  }, [stream, camOn]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
  }, [stream, micOn]);

  function handleJoin() {
    onJoin({ micOn, camOn, cameraId, micId });
  }

  // Same reasoning as ParticipantTile: the preview box stays a uniform
  // landscape frame, a portrait camera is fit inside it rather than
  // resizing the box.
  const videoFitClass = orientation === "portrait" ? "object-contain" : "object-cover";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      {permissionError && (
        <Alert variant="destructive">
          <AlertDescription>{permissionError}</AlertDescription>
        </Alert>
      )}
      <div className="relative mx-auto flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black">
        {camOn && stream ? (
          <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full ${videoFitClass}`} />
        ) : (
          <p className="text-sm text-white/70">{permissionError ? "No camera" : "The camera is off"}</p>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <Button type="button" variant={micOn ? "secondary" : "destructive"} size="icon" onClick={() => setMicOn((v) => !v)} title={micOn ? "Mute" : "Unmute"}>
            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </Button>
          <Button type="button" variant={camOn ? "secondary" : "destructive"} size="icon" onClick={() => setCamOn((v) => !v)} title={camOn ? "Turn off camera" : "Turn on camera"}>
            {camOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Camera</Label>
          <Select value={cameraId || "default"} onValueChange={(v) => setCameraId(v === "default" ? "" : (v ?? ""))}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => cameras.find((c) => c.deviceId === cameraId)?.label || "Default camera"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default camera</SelectItem>
              {cameras.map((c) => (
                <SelectItem key={c.deviceId} value={c.deviceId}>
                  {c.label || "Camera"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Microphone</Label>
          <Select value={micId || "default"} onValueChange={(v) => setMicId(v === "default" ? "" : (v ?? ""))}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => mics.find((m) => m.deviceId === micId)?.label || "Default microphone"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default microphone</SelectItem>
              {mics.map((m) => (
                <SelectItem key={m.deviceId} value={m.deviceId}>
                  {m.label || "Microphone"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="button" onClick={handleJoin} disabled={!canJoin}>
        {canJoin ? "Join now" : "Preparing your meeting..."}
      </Button>
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

interface JoinInfo {
  roomId: string;
  token: string;
  displayName: string;
  isModerator: boolean;
  requireAdmission: boolean;
  startedAt: string;
  maxDurationMinutes: number | null;
}

export function KmeetCall({ meetingId, title, alreadyEnded, canEnd, guestName, backHref }: KmeetCallProps) {
  const router = useRouter();
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(alreadyEnded ? "This meeting has already ended." : null);
  const [left, setLeft] = useState(false);
  const [lobbyChoice, setLobbyChoice] = useState<LobbyChoice | null>(null);

  useEffect(() => {
    if (alreadyEnded) return;
    const join = guestName ? joinMeetingAsGuestAction(meetingId, guestName) : joinMeetingAction(meetingId);
    join.then((result) => {
      if (result.error || !result.roomId || !result.token || !result.startedAt) {
        setError(result.error ?? "Couldn't join this meeting.");
        return;
      }
      setJoinInfo({
        roomId: result.roomId,
        token: result.token,
        displayName: result.displayName ?? "Guest",
        isModerator: result.isModerator ?? false,
        requireAdmission: result.requireAdmission ?? false,
        startedAt: result.startedAt,
        maxDurationMinutes: result.maxDurationMinutes ?? null,
      });
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

  if (!lobbyChoice) {
    return <PreJoinLobby title={title} canJoin={!!joinInfo} onJoin={setLobbyChoice} />;
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
      <MeetingProvider
        config={{
          meetingId: joinInfo.roomId,
          micEnabled: lobbyChoice.micOn,
          webcamEnabled: lobbyChoice.camOn,
          name: joinInfo.displayName,
          debugMode: false,
        }}
        token={joinInfo.token}
      >
        <CallView
          meetingId={meetingId}
          canEnd={canEnd}
          isModerator={joinInfo.isModerator}
          initialRequireAdmission={joinInfo.requireAdmission}
          startedAt={joinInfo.startedAt}
          maxDurationMinutes={joinInfo.maxDurationMinutes}
          cameraId={lobbyChoice.cameraId}
          micId={lobbyChoice.micId}
          onLeft={handleLeft}
        />
      </MeetingProvider>
    </div>
  );
}
