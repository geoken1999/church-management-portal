"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone,
  Paperclip,
  Reply,
  Send,
  Trash2,
  X,
  FileText,
} from "lucide-react";
import {
  attachmentLinkAction,
  deleteMessageAction,
  loadMessagesAction,
  sendMessageAction,
  uploadSlotAction,
  type WebMessage,
  type WebParticipant,
} from "@/lib/group-chat/actions";
import { attachmentProblem, GROUP_CHAT_BUCKET } from "@/lib/group-chat/rules";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

const POLL_MS = 4000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function Attachment({
  organizationId,
  message,
}: {
  organizationId: string;
  message: WebMessage;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (message.attachmentType !== "image") return;
    attachmentLinkAction(organizationId, message.id)
      .then((r) => !cancelled && r.url && setUrl(r.url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId, message.id, message.attachmentType]);

  async function open() {
    const r = await attachmentLinkAction(organizationId, message.id).catch(
      () => null,
    );
    if (r?.url) window.open(r.url, "_blank", "noopener");
  }

  if (message.attachmentType === "image")
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={message.attachmentName ?? "Photo"}
        className="mt-1 max-h-64 cursor-pointer rounded-lg"
        onClick={open}
      />
    ) : (
      <div className="mt-1 h-24 w-40 animate-pulse rounded-lg bg-muted" />
    );
  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
    >
      <FileText className="size-4 text-primary" />
      <span className="truncate">{message.attachmentName ?? "File"}</span>
    </button>
  );
}

// The chat on the web. It reads through the server (so a manager who is not in the group can follow it) and
// refreshes every few seconds; the apps get messages instantly. Posting from here makes a team login part of the
// group, so they are notified of replies.
export function GroupChat({
  organizationId,
  groupId,
  participants,
  canWrite,
  canDelete,
  selfAuthUserId,
}: {
  organizationId: string;
  groupId: string;
  participants: WebParticipant[];
  canWrite: boolean;
  canDelete: boolean;
  selfAuthUserId: string;
}) {
  const [messages, setMessages] = useState<WebMessage[]>([]); // oldest first
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<WebMessage | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const mentionable = useMemo(
    () =>
      participants.filter(
        (p) => p.authUserId && p.authUserId !== selfAuthUserId,
      ),
    [participants, selfAuthUserId],
  );
  const atMatch = /(?:^|\s)@([^\s@]*)$/.exec(draft);
  const suggestions = atMatch
    ? mentionable
        .filter((p) => p.name.toLowerCase().includes(atMatch[1].toLowerCase()))
        .slice(0, 6)
    : [];

  const merge = useCallback((incoming: WebMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    });
  }, []);

  const refresh = useCallback(async () => {
    const result = await loadMessagesAction(organizationId, groupId).catch(
      () => null,
    );
    if (!result) return;
    if (result.error) return setError(result.error);
    merge(result.messages ?? []);
    setHasMore((h) => (loaded ? h : Boolean(result.hasMore)));
    setLoaded(true);
  }, [organizationId, groupId, merge, loaded]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function loadEarlier() {
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;
    stick.current = false;
    const result = await loadMessagesAction(
      organizationId,
      groupId,
      oldest,
    ).catch(() => null);
    if (result?.messages) {
      merge(result.messages);
      setHasMore(Boolean(result.hasMore));
    }
  }

  async function send() {
    setError(null);
    const body = draft.trim();
    if (!body && !file) return;
    setBusy(true);
    try {
      let attachment: { path: string; name: string; size: number } | null =
        null;
      if (file) {
        const problem = attachmentProblem({ name: file.name, size: file.size });
        if (problem) throw new Error(problem);
        const slot = await uploadSlotAction(
          organizationId,
          groupId,
          file.name,
          file.size,
        );
        if (slot.error || !slot.path || !slot.token)
          throw new Error(slot.error ?? "Couldn't upload the file.");
        const { error: uploadError } = await createClient()
          .storage.from(GROUP_CHAT_BUCKET)
          .uploadToSignedUrl(slot.path, slot.token, file);
        if (uploadError)
          throw new Error("Couldn't upload the file. Please try again.");
        attachment = { path: slot.path, name: file.name, size: file.size };
      }
      const mentions = mentionable
        .filter((p) => body.includes(`@${p.name}`))
        .map((p) => p.authUserId as string);
      const result = await sendMessageAction(organizationId, groupId, {
        body,
        replyTo: replyTo?.id ?? null,
        announcement,
        mentions,
        attachment,
      });
      if (result.error || !result.message)
        throw new Error(result.error ?? "Couldn't send the message.");
      stick.current = true;
      merge([result.message]);
      setDraft("");
      setFile(null);
      setReplyTo(null);
      setAnnouncement(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the message.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: WebMessage) {
    if (!window.confirm("Delete this message for everyone?")) return;
    const result = await deleteMessageAction(organizationId, m.id).catch(
      () => ({ error: "Something went wrong." }) as { error?: string },
    );
    if (result.error) setError(result.error);
    else
      merge([
        {
          ...m,
          body: null,
          attachmentType: null,
          attachmentName: null,
          deleted: true,
        },
      ]);
  }

  return (
    <div className="flex h-[65vh] flex-col overflow-hidden rounded-xl border border-border">
      <ErrorToast message={error} />
      <div
        className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <div className="text-center">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={loadEarlier}
            >
              Load earlier messages
            </Button>
          </div>
        )}
        {loaded && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderAuthUserId === selfAuthUserId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.announcement ? "border border-primary/40 bg-primary/10" : mine ? "bg-primary text-primary-foreground" : "bg-card"}`}
              >
                <p
                  className={`text-xs font-medium ${mine && !m.announcement ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                >
                  {m.senderName} · {formatTime(m.createdAt)}
                  {m.announcement && (
                    <Badge className="ml-2" variant="secondary">
                      <Megaphone className="mr-1 size-3" /> Announcement
                    </Badge>
                  )}
                </p>
                {m.replyTo && (
                  <div className="my-1 rounded-md border-l-2 border-current/40 bg-black/5 px-2 py-1 text-xs opacity-80">
                    <span className="font-medium">
                      {m.replySender ?? "Message"}
                    </span>
                    : {m.replyBody}
                  </div>
                )}
                {m.deleted ? (
                  <p className="italic opacity-70">This message was deleted</p>
                ) : (
                  <>
                    {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                    {m.attachmentType && (
                      <Attachment organizationId={organizationId} message={m} />
                    )}
                  </>
                )}
                {!m.deleted && (
                  <div className="mt-1 flex gap-1 opacity-70">
                    {canWrite && (
                      <button
                        type="button"
                        aria-label="Reply"
                        className="rounded p-0.5 hover:opacity-100"
                        onClick={() => setReplyTo(m)}
                      >
                        <Reply className="size-3.5" />
                      </button>
                    )}
                    {(mine || canDelete) && (
                      <button
                        type="button"
                        aria-label="Delete message"
                        className="rounded p-0.5 hover:opacity-100"
                        onClick={() => remove(m)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {canWrite ? (
        <div className="space-y-2 border-t border-border bg-background p-3">
          {replyTo && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs">
              <span className="truncate">
                Replying to {replyTo.senderName}: {replyTo.body ?? "attachment"}
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {file && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label="Remove file"
                onClick={() => setFile(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() =>
                    setDraft((d) => d.replace(/@[^\s@]*$/, `@${p.name} `))
                  }
                >
                  @{p.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label
              className="cursor-pointer rounded-md p-2 hover:bg-muted"
              title="Attach a photo or file"
            >
              <Paperclip className="size-4" />
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <Textarea
              value={draft}
              rows={2}
              maxLength={4000}
              placeholder="Write a message. Type @ to mention someone."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              type="button"
              disabled={busy || (!draft.trim() && !file)}
              onClick={send}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={announcement}
              onChange={(e) => setAnnouncement(e.target.checked)}
            />
            Post as an announcement (notifies everyone who has not turned the
            group off)
          </label>
        </div>
      ) : (
        <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
          You can read this chat. Posting needs Write access to Groups.
        </p>
      )}
    </div>
  );
}
