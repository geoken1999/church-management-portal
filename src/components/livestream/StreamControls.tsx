"use client";

import { useEffect, useRef, useState } from "react";
import { useMeeting } from "@videosdk.live/react-sdk";
import { LogOut, MessageSquare, Mic, MicOff, ScreenShare, ScreenShareOff, Send, Video as VideoIcon, VideoOff, X } from "lucide-react";
import { endStreamAndRoomAction, getLiveStateAction, sendHostChatAction, type LiveState } from "@/lib/livestream/actions";
import { GoLiveButton } from "@/components/livestream/GoLiveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The broadcast room's controls: what the broadcaster needs (mic, camera, screen, Go
// live, the audience chat), not a call's (reactions, invite link, admission).
export function StreamControls({ streamId, chatOpen, onToggleChat, onLeft }: { streamId: string; chatOpen: boolean; onToggleChat: () => void; onLeft: () => void }) {
  const { leave, end, toggleMic, toggleWebcam, toggleScreenShare, localMicOn, localWebcamOn, localScreenShareOn } = useMeeting();

  function handleLeave() {
    leave();
    onLeft();
  }

  // The stream and room are over: close this tab (it can only close itself when the
  // dashboard opened it), otherwise go back to the stream page.
  function closeRoom() {
    end();
    window.close();
    setTimeout(onLeft, 400);
  }

  async function handleEnd() {
    if (!window.confirm("End the live stream and close the room for everyone?")) return;
    await endStreamAndRoomAction(streamId);
    closeRoom();
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
      <Button type="button" variant={chatOpen ? "default" : "outline"} size="icon" onClick={onToggleChat} title="Audience chat">
        <MessageSquare className="size-4" />
      </Button>
      <GoLiveButton streamId={streamId} onEnded={closeRoom} />
      <Button type="button" variant="outline" onClick={handleLeave} title="Leave the room; a stream sent from OBS keeps going">
        <LogOut className="size-4" />
        Leave room
      </Button>
      <Button type="button" variant="ghost" onClick={handleEnd}>
        End stream and room
      </Button>
    </div>
  );
}

// The audience's chat, beside the broadcast.
export function AudiencePanel({ streamId, onClose }: { streamId: string; onClose: () => void }) {
  const [state, setState] = useState<LiveState>({});
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    const load = () => getLiveStateAction(streamId).then((s) => !stopped && !s.error && setState(s));
    load();
    const timer = setInterval(load, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [streamId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state.messages?.length]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    sendHostChatAction(streamId, text).then(() => getLiveStateAction(streamId).then((s) => !s.error && setState(s)));
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="text-sm font-medium">Audience chat</p>
          <p className="text-xs text-muted-foreground">{state.status === "live" ? `${state.viewers ?? 0} watching` : "Not live yet"}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {(state.messages ?? []).length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
        {(state.messages ?? []).map((m) => (
          <p key={m.id}>
            <span className={m.author_kind === "host" ? "font-semibold text-primary" : "font-semibold"}>{m.author_name}</span> {m.body}
          </p>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input value={draft} maxLength={300} placeholder="Message the audience" onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" size="icon" aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
