"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Heart,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Send,
  ChevronLeft,
  AlertTriangle,
  Sparkles,
  PictureInPicture2,
  X,
  Minus,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import {
  disconnectInstagram,
  loadMoreInstagramMedia,
  loadMoreInstagramConversations,
  refreshInstagramConversations,
  getInstagramConversationMessages,
  sendInstagramReply,
  markInstagramConversationRead,
  getInstagramAiMode,
  setInstagramAiMode,
  listCommentAutomations,
  addCommentAutomation,
  toggleCommentAutomation,
  removeCommentAutomation,
} from "@/lib/instagram/actions";
import type { InstagramConnectionSummary, InstagramDashboardData } from "@/lib/instagram/dal";
import type { InstagramMedia, InstagramInsightValue, InstagramConversation, InstagramMessage } from "@/lib/instagram/client";
import type { InstagramCommentAutomation } from "@/types/database";
import { HUMAN_AGENT_WINDOW_MS, STANDARD_WINDOW_MS } from "@/lib/instagram/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const INSIGHT_LABELS: Record<string, string> = {
  reach: "Reach",
  profile_views: "Profile views",
  accounts_engaged: "Accounts engaged",
  total_interactions: "Total interactions",
  saved: "Saved",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  plays: "Plays",
};

function insightLabel(name: string): string {
  return INSIGHT_LABELS[name] ?? name;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function initial(name: string | null): string {
  return (name ?? "?").charAt(0).toUpperCase();
}

// This app has no push channel for Instagram messages (no stored data to
// subscribe to — everything is fetched live from the Graph API on demand),
// so "real-time" here means polling on a short interval instead.
const CONVERSATION_LIST_POLL_MS = 20_000;
const MESSAGE_THREAD_POLL_MS = 8_000;

// ---------------------------------------------------------------------------
// Not connected
// ---------------------------------------------------------------------------

function ConnectInstagramCard({ canManage }: { canManage: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <InstagramIcon className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-heading text-base font-bold">Connect your Instagram business profile</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            View posts, insights, and messages from your Instagram professional account right here — no need to
            switch apps.
          </p>
        </div>
        {canManage ? (
          <Button type="button" nativeButton={false} render={<a href="/api/instagram/connect" />}>
            <InstagramIcon className="size-4" />
            Connect Instagram
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an admin to connect your Instagram account.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Header (profile summary + disconnect)
// ---------------------------------------------------------------------------

function InstagramHeader({
  organizationId,
  profile,
  syncError,
  canManage,
}: {
  organizationId: string;
  profile: InstagramConnectionSummary;
  syncError: boolean;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {profile.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profilePictureUrl}
              alt={profile.username}
              className="size-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent">
              <InstagramIcon className="size-5 text-accent-foreground" />
            </div>
          )}
          <div>
            <p className="font-heading text-base font-bold">@{profile.username}</p>
            <p className="text-sm text-muted-foreground">
              {profile.mediaCount ?? 0} posts · {profile.followersCount ?? 0} followers
              {profile.accountType && ` · ${profile.accountType}`}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href="/api/instagram/connect" />}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
            <form action={disconnectInstagram}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <Button type="submit" variant="ghost" size="sm">
                Disconnect
              </Button>
            </form>
          </div>
        )}
      </CardContent>
      {syncError && (
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Couldn&apos;t sync with Instagram — the connection may have expired.{" "}
              {canManage ? 'Click "Reconnect" above to restore it.' : "Ask an admin to reconnect it."}
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function PostInsightsDialog({ media }: { media: InstagramMedia }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm">Insights</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post insights</DialogTitle>
          <DialogDescription>{media.caption ?? "No caption"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Likes</p>
            <p className="text-lg font-bold">{media.likeCount}</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Comments</p>
            <p className="text-lg font-bold">{media.commentsCount}</p>
          </div>
        </div>
        <a
          href={media.permalink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          View on Instagram
          <ExternalLink className="size-3.5" />
        </a>
      </DialogContent>
    </Dialog>
  );
}

function PostAutomationDialog({
  organizationId,
  media,
  canManage,
  automations,
  onAutomationsChange,
}: {
  organizationId: string;
  media: InstagramMedia;
  canManage: boolean;
  automations: InstagramCommentAutomation[];
  onAutomationsChange: (next: InstagramCommentAutomation[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [replyTemplate, setReplyTemplate] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, startSaving] = useTransition();

  const rulesForThisPost = automations.filter((a) => a.media_id === media.id);

  function handleCreate() {
    if (!replyTemplate.trim()) {
      setError("Reply message can't be empty.");
      return;
    }
    startSaving(async () => {
      const result = await addCommentAutomation(organizationId, {
        mediaId: media.id,
        keyword: keyword.trim() || null,
        replyTemplate: replyTemplate.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setKeyword("");
      setReplyTemplate("");
      onAutomationsChange(await listCommentAutomations(organizationId));
    });
  }

  function handleToggle(automationId: string, enabled: boolean) {
    onAutomationsChange(automations.map((a) => (a.id === automationId ? { ...a, enabled } : a)));
    toggleCommentAutomation(organizationId, automationId, enabled);
  }

  function handleDelete(automationId: string) {
    onAutomationsChange(automations.filter((a) => a.id !== automationId));
    removeCommentAutomation(organizationId, automationId);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Zap className="size-3.5" />
            Automation{rulesForThisPost.length > 0 ? ` (${rulesForThisPost.length})` : ""}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comment automation for this post</DialogTitle>
          <DialogDescription>
            When a comment on this post matches, the commenter gets an automatic DM.
          </DialogDescription>
        </DialogHeader>

        {rulesForThisPost.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {rulesForThisPost.map((automation) => (
              <div key={automation.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Badge variant="outline" className="text-[10px]">
                    {automation.keyword ? `Keyword: "${automation.keyword}"` : "Any comment"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{automation.reply_template}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant={automation.enabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggle(automation.id, !automation.enabled)}
                    >
                      {automation.enabled ? "On" : "Off"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(automation.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`post-automation-keyword-${media.id}`}>Keyword (optional)</Label>
              <Input
                id={`post-automation-keyword-${media.id}`}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. LINK — leave blank to match any comment"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`post-automation-reply-${media.id}`}>DM to send</Label>
              <Textarea
                id={`post-automation-reply-${media.id}`}
                value={replyTemplate}
                onChange={(e) => setReplyTemplate(e.target.value)}
                placeholder="Thanks for your comment! Here's the link..."
                rows={3}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? "Saving..." : "Add rule for this post"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PostCard({
  media,
  organizationId,
  canManage,
  automations,
  onAutomationsChange,
}: {
  media: InstagramMedia;
  organizationId: string;
  canManage: boolean;
  automations: InstagramCommentAutomation[];
  onAutomationsChange: (next: InstagramCommentAutomation[]) => void;
}) {
  const image = media.thumbnailUrl ?? media.mediaUrl;

  return (
    <Card>
      <CardContent className="space-y-2.5">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={media.caption ?? "Instagram post"} className="aspect-square w-full rounded-lg object-cover" />
        )}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Heart className="size-3.5" />
              {media.likeCount}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3.5" />
              {media.commentsCount}
            </span>
          </div>
          <Badge variant="outline">{media.mediaType}</Badge>
        </div>
        {media.caption && <p className="line-clamp-2 text-sm text-muted-foreground">{media.caption}</p>}
        <div className="flex items-center gap-2">
          <PostInsightsDialog media={media} />
          <PostAutomationDialog
            organizationId={organizationId}
            media={media}
            canManage={canManage}
            automations={automations}
            onAutomationsChange={onAutomationsChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function InstagramPostsTab({
  organizationId,
  canManage,
  initialMedia,
  automations,
  onAutomationsChange,
}: {
  organizationId: string;
  canManage: boolean;
  initialMedia: { items: InstagramMedia[]; nextCursor: string | null };
  automations: InstagramCommentAutomation[];
  onAutomationsChange: (next: InstagramCommentAutomation[]) => void;
}) {
  const [items, setItems] = useState(initialMedia.items);
  const [cursor, setCursor] = useState(initialMedia.nextCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreInstagramMedia(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No posts yet.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((media) => (
          <PostCard
            key={media.id}
            media={media}
            organizationId={organizationId}
            canManage={canManage}
            automations={automations}
            onAutomationsChange={onAutomationsChange}
          />
        ))}
      </div>
      {cursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function InstagramInsightsTab({
  profile,
  insights,
}: {
  profile: InstagramConnectionSummary;
  insights: InstagramInsightValue[];
}) {
  const stats = [
    { name: "followers", value: profile.followersCount ?? 0 },
    { name: "media_count", value: profile.mediaCount ?? 0 },
    ...insights,
  ];
  const statLabels: Record<string, string> = { followers: "Followers", media_count: "Total posts" };

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.name}>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">{statLabels[stat.name] ?? insightLabel(stat.name)}</p>
            <p className="mt-1 text-2xl font-bold">{stat.value.toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type WindowState = "open" | "taggable" | "closed" | "unknown";

function getWindowState(lastInboundAt: string | null): WindowState {
  if (!lastInboundAt) return "unknown";
  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  if (elapsed <= STANDARD_WINDOW_MS) return "open";
  if (elapsed <= HUMAN_AGENT_WINDOW_MS) return "taggable";
  return "closed";
}

function computeLastInboundAt(messages: InstagramMessage[], profileUsername: string): string | null {
  const inbound = messages.filter((m) => m.fromUsername !== profileUsername);
  if (inbound.length === 0) return null;
  return inbound.reduce(
    (latest, m) => (new Date(m.createdTime) > new Date(latest) ? m.createdTime : latest),
    inbound[0].createdTime,
  );
}

// Merges a freshly-polled first page into the existing (possibly
// "load more"-extended) list: updates matching conversations in place and
// prepends any that are brand new, without disturbing older pages.
function mergeConversations(existing: InstagramConversation[], fresh: InstagramConversation[]): InstagramConversation[] {
  const freshById = new Map(fresh.map((c) => [c.id, c]));
  const existingIds = new Set(existing.map((c) => c.id));
  const newOnes = fresh.filter((c) => !existingIds.has(c.id));
  const merged = existing.map((c) => freshById.get(c.id) ?? c);
  return [...newOnes, ...merged];
}

function ConversationListItem({
  conversation,
  active,
  onSelect,
}: {
  conversation: InstagramConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const awaitingReply = conversation.lastMessageFromOwner === false;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/60 ${
        active ? "bg-accent" : ""
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
      <div className="relative shrink-0">
        <Avatar>
          <AvatarFallback>{initial(conversation.participantUsername)}</AvatarFallback>
        </Avatar>
        {conversation.unread && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-sm ${conversation.unread ? "font-bold" : "font-medium"}`}>
            {conversation.participantUsername ?? "Unknown"}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.updatedTime)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {conversation.snippet && (
            <p className={`truncate text-xs ${conversation.unread ? "text-foreground" : "text-muted-foreground"}`}>
              {conversation.snippet}
            </p>
          )}
          {awaitingReply && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              Needs reply
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function ConversationThread({
  organizationId,
  conversation,
  profileUsername,
  onBack,
  onPopOut,
  onMinimize,
  onClose,
}: {
  organizationId: string;
  conversation: InstagramConversation;
  profileUsername: string;
  onBack: () => void;
  // Only ever passed by one caller each: the main panel offers "pop out"
  // (into the floating window); the floating window offers "minimize" and
  // "close" instead.
  onPopOut?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [lastInboundAt, setLastInboundAt] = useState(conversation.lastInboundAt);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, startSending] = useTransition();
  const [aiMode, setAiMode] = useState(false);
  const [aiModePending, startAiModeTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function load() {
      getInstagramConversationMessages(organizationId, conversation.id).then((fetched) => {
        setMessages(fetched);
        setLoading(false);
        const computed = computeLastInboundAt(fetched, profileUsername);
        if (computed) setLastInboundAt(computed);
      });
    }
    load();
    const interval = setInterval(load, MESSAGE_THREAD_POLL_MS);
    return () => clearInterval(interval);
    // ConversationThread is remounted (via `key`) whenever the selected
    // conversation changes, so initial state already covers loading/reply —
    // this effect only needs to run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    markInstagramConversationRead(organizationId, conversation.id);
    // Only needs to fire once when the thread is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!conversation.participantId) return;
    getInstagramAiMode(organizationId, conversation.participantId).then(setAiMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleAiMode() {
    if (!conversation.participantId) return;
    const next = !aiMode;
    setAiMode(next);
    startAiModeTransition(() => setInstagramAiMode(organizationId, conversation.participantId as string, next));
  }

  const windowState = getWindowState(lastInboundAt);

  function handleSend() {
    if (!conversation.participantId || !reply.trim() || windowState === "closed") return;
    const text = reply.trim();
    startSending(async () => {
      const result = await sendInstagramReply(
        organizationId,
        conversation.participantId as string,
        text,
        windowState === "taggable",
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, fromUsername: profileUsername, text, createdTime: new Date().toISOString() },
      ]);
      setReply("");
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button type="button" variant="ghost" size="icon" className="sm:hidden" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <Avatar size="sm">
          <AvatarFallback>{initial(conversation.participantUsername)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate font-medium">{conversation.participantUsername ?? "Unknown"}</p>
        {conversation.participantId && (
          <Button
            type="button"
            variant={aiMode ? "default" : "outline"}
            size="sm"
            onClick={handleToggleAiMode}
            disabled={aiModePending}
            title="When on, AI replies to this person automatically with no review"
          >
            <Sparkles className="size-3.5" />
            AI mode {aiMode ? "on" : "off"}
          </Button>
        )}
        {onPopOut && (
          <Button type="button" variant="ghost" size="icon" onClick={onPopOut} title="Pop out into a floating window">
            <PictureInPicture2 className="size-4" />
          </Button>
        )}
        {onMinimize && (
          <Button type="button" variant="ghost" size="icon" onClick={onMinimize} title="Minimize">
            <Minus className="size-4" />
          </Button>
        )}
        {onClose && (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} title="Close">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {aiMode && (
        <div className="border-b border-border bg-primary/5 px-4 py-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            AI is replying to this conversation automatically. Turn it off to take over.
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-sm text-muted-foreground">Loading messages...</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
        )}
        {messages.map((message) => {
          const isOwn = message.fromUsername === profileUsername;
          return (
            <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  isOwn ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
                }`}
              >
                <p>{message.text}</p>
                <p className={`mt-0.5 text-[10px] ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatMessageTime(message.createdTime)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 pb-2">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {windowState === "taggable" && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            It&apos;s been over 24 hours since their last message — this reply will be sent as a human-agent
            response, which Instagram allows for up to 7 days.
          </p>
        </div>
      )}

      {!conversation.participantId ? (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Can&apos;t identify the recipient for this conversation — replying isn&apos;t available.
        </p>
      ) : windowState === "closed" ? (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          It&apos;s been more than 7 days since {conversation.participantUsername ?? "they"} last messaged you —
          Instagram no longer allows replying here. Reply to them directly in the Instagram app instead.
        </p>
      ) : (
        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a reply..."
            rows={1}
            className="max-h-32 flex-1 resize-none"
          />
          <Button type="button" size="icon" onClick={handleSend} disabled={sending || !reply.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function InstagramMessagesTab({
  organizationId,
  profileUsername,
  initialConversations,
  onPopOut,
  onOpenFullWindow,
  fullHeight,
}: {
  organizationId: string;
  profileUsername: string;
  initialConversations: { items: InstagramConversation[]; nextCursor: string | null };
  // Omitted inside the standalone popup window itself — floating a
  // conversation out of a window that's already dedicated to messaging
  // would just be confusing.
  onPopOut?: (conversation: InstagramConversation) => void;
  // Omitted inside the popup window for the same reason — there's nothing
  // further to open from there.
  onOpenFullWindow?: () => void;
  // The embedded tab is capped at a fixed height to fit inside the Card
  // alongside Posts/Insights/Automation; the standalone popup window should
  // instead fill the whole browser window.
  fullHeight?: boolean;
}) {
  const [items, setItems] = useState(initialConversations.items);
  const [cursor, setCursor] = useState(initialConversations.nextCursor);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    const interval = setInterval(async () => {
      const page = await refreshInstagramConversations(organizationId);
      setItems((prev) => mergeConversations(prev, page.items));
    }, CONVERSATION_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [organizationId]);

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreInstagramConversations(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    // Optimistic — ConversationThread also marks it read server-side on
    // mount, but clearing the dot immediately reads better than waiting for
    // the next poll to confirm it.
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <MessageCircle className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-heading text-sm font-bold">No conversations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Messages sent to your Instagram account will show up here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={fullHeight ? "overflow-hidden rounded-none border-0 py-0 shadow-none" : "overflow-hidden py-0"}>
      <div className={`flex ${fullHeight ? "h-dvh" : "h-[34rem]"}`}>
        <div
          className={`w-full flex-col border-border sm:w-80 sm:flex-none sm:border-r ${
            selected ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <p className="font-heading text-sm font-bold">Messages</p>
              <p className="text-xs text-muted-foreground">
                {items.length} conversation{items.length === 1 ? "" : "s"}
              </p>
            </div>
            {onOpenFullWindow && (
              <Button type="button" variant="ghost" size="icon" onClick={onOpenFullWindow} title="Open in a new window">
                <ExternalLink className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
            {items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selectedId}
                onSelect={() => selectConversation(conversation.id)}
              />
            ))}
          </div>
          {cursor && (
            <div className="shrink-0 border-t border-border p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={loadMore}
                disabled={pending}
              >
                {pending ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>

        <div className={`flex-1 flex-col ${selected ? "flex" : "hidden sm:flex"}`}>
          {selected ? (
            <ConversationThread
              key={selected.id}
              organizationId={organizationId}
              conversation={selected}
              profileUsername={profileUsername}
              onBack={() => setSelectedId(null)}
              onPopOut={
                onPopOut
                  ? () => {
                      onPopOut(selected);
                      setSelectedId(null);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <MessageCircle className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold">Select a conversation</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose from the list to start chatting.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// A conversation popped out of the Messages tab — rendered as a sibling of
// <Tabs> at the root, not inside any TabsPanel, so it stays visible and
// polling even while browsing Posts/Insights on the same Instagram page
// (base-ui's Tabs unmounts inactive panels, which would otherwise kill it
// the moment the tab changed).
function FloatingChatWindow({
  organizationId,
  conversation,
  profileUsername,
  onClose,
}: {
  organizationId: string;
  conversation: InstagramConversation;
  profileUsername: string;
  onClose: () => void;
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      {minimized ? (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 p-3 text-left hover:bg-accent"
        >
          <Avatar size="sm">
            <AvatarFallback>{initial(conversation.participantUsername)}</AvatarFallback>
          </Avatar>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.participantUsername ?? "Unknown"}</p>
          <Plus className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex h-[28rem] flex-col">
          <ConversationThread
            key={conversation.id}
            organizationId={organizationId}
            conversation={conversation}
            profileUsername={profileUsername}
            onBack={onClose}
            onMinimize={() => setMinimized(true)}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment automation
// ---------------------------------------------------------------------------

function CommentAutomationRow({
  automation,
  mediaCaption,
  onToggle,
  onDelete,
}: {
  automation: InstagramCommentAutomation;
  mediaCaption: string | null;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border p-4 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {automation.media_id ? `Post: ${mediaCaption ?? "Untitled post"}` : "Any post"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {automation.keyword ? `Keyword: "${automation.keyword}"` : "Any comment"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{automation.reply_template}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant={automation.enabled ? "default" : "outline"} size="sm" onClick={() => onToggle(!automation.enabled)}>
          {automation.enabled ? "On" : "Off"}
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function InstagramAutomationTab({
  organizationId,
  canManage,
  media,
  automations,
  onAutomationsChange,
}: {
  organizationId: string;
  canManage: boolean;
  media: InstagramMedia[];
  automations: InstagramCommentAutomation[];
  onAutomationsChange: (next: InstagramCommentAutomation[]) => void;
}) {
  const [mediaId, setMediaId] = useState<string>("any");
  const [keyword, setKeyword] = useState("");
  const [replyTemplate, setReplyTemplate] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, startSaving] = useTransition();

  const captionByMediaId = new Map(media.map((m) => [m.id, m.caption]));

  function handleCreate() {
    if (!replyTemplate.trim()) {
      setError("Reply message can't be empty.");
      return;
    }
    startSaving(async () => {
      const result = await addCommentAutomation(organizationId, {
        mediaId: mediaId === "any" ? null : mediaId,
        keyword: keyword.trim() || null,
        replyTemplate: replyTemplate.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      onAutomationsChange(await listCommentAutomations(organizationId));
      setMediaId("any");
      setKeyword("");
      setReplyTemplate("");
    });
  }

  function handleToggle(automationId: string, enabled: boolean) {
    onAutomationsChange(automations.map((a) => (a.id === automationId ? { ...a, enabled } : a)));
    toggleCommentAutomation(organizationId, automationId, enabled);
  }

  function handleDelete(automationId: string) {
    onAutomationsChange(automations.filter((a) => a.id !== automationId));
    removeCommentAutomation(organizationId, automationId);
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-4" />
              New automation rule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              When a comment matches, the commenter gets an automatic DM — using Instagram&apos;s private-reply
              mechanism, so it works even if they&apos;ve never messaged the account before.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Applies to</Label>
                <Select value={mediaId} onValueChange={(v) => setMediaId(v ?? "any")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {() => (mediaId === "any" ? "Any post" : (captionByMediaId.get(mediaId) ?? "Untitled post"))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any post</SelectItem>
                    {media.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.caption ? m.caption.slice(0, 60) : "Untitled post"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="automation-keyword">Keyword (optional)</Label>
                <Input
                  id="automation-keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. LINK — leave blank to match any comment"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="automation-reply">DM to send</Label>
              <Textarea
                id="automation-reply"
                value={replyTemplate}
                onChange={(e) => setReplyTemplate(e.target.value)}
                placeholder="Thanks for your comment! Here's the link..."
                rows={3}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? "Saving..." : "Add rule"}
            </Button>
          </CardContent>
        </Card>
      )}

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No automation rules yet. {canManage ? "Add one above." : "Ask an admin to set one up."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {automations.map((automation) => (
            <CommentAutomationRow
              key={automation.id}
              automation={automation}
              mediaCaption={automation.media_id ? (captionByMediaId.get(automation.media_id) ?? null) : null}
              onToggle={(enabled) => handleToggle(automation.id, enabled)}
              onDelete={() => handleDelete(automation.id)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function InstagramManager({
  organizationId,
  canManage,
  data,
}: {
  organizationId: string;
  canManage: boolean;
  data: InstagramDashboardData;
}) {
  const [poppedOut, setPoppedOut] = useState<InstagramConversation | null>(null);
  const [automations, setAutomations] = useState<InstagramCommentAutomation[]>(
    data.connected ? data.automations : [],
  );

  if (!data.connected) {
    return <ConnectInstagramCard canManage={canManage} />;
  }

  return (
    <div className="space-y-4">
      <InstagramHeader
        organizationId={organizationId}
        profile={data.profile}
        syncError={data.syncError}
        canManage={canManage}
      />

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="posts">Posts</TabsTab>
          <TabsTab value="insights">Insights</TabsTab>
          <TabsTab value="messages">Messages</TabsTab>
          <TabsTab value="automation">Automation</TabsTab>
        </TabsList>
        <TabsPanel value="posts">
          <InstagramPostsTab
            organizationId={organizationId}
            canManage={canManage}
            initialMedia={data.media}
            automations={automations}
            onAutomationsChange={setAutomations}
          />
        </TabsPanel>
        <TabsPanel value="insights">
          <InstagramInsightsTab profile={data.profile} insights={data.insights} />
        </TabsPanel>
        <TabsPanel value="messages">
          <InstagramMessagesTab
            organizationId={organizationId}
            profileUsername={data.profile.username}
            initialConversations={data.conversations}
            onPopOut={setPoppedOut}
            onOpenFullWindow={() => {
              window.open(
                "/instagram-messages",
                `instagram-messages-${organizationId}`,
                "width=1000,height=700,noopener,noreferrer",
              );
            }}
          />
        </TabsPanel>
        <TabsPanel value="automation">
          <InstagramAutomationTab
            organizationId={organizationId}
            canManage={canManage}
            media={data.media.items}
            automations={automations}
            onAutomationsChange={setAutomations}
          />
        </TabsPanel>
      </Tabs>

      {poppedOut && (
        <FloatingChatWindow
          organizationId={organizationId}
          conversation={poppedOut}
          profileUsername={data.profile.username}
          onClose={() => setPoppedOut(null)}
        />
      )}
    </div>
  );
}
