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
} from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import {
  disconnectInstagram,
  loadMoreInstagramMedia,
  loadMoreInstagramConversations,
  getInstagramConversationMessages,
  sendInstagramReply,
} from "@/lib/instagram/actions";
import type { InstagramConnectionSummary, InstagramDashboardData } from "@/lib/instagram/dal";
import type { InstagramMedia, InstagramInsightValue, InstagramConversation, InstagramMessage } from "@/lib/instagram/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
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

function PostCard({ media }: { media: InstagramMedia }) {
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
        <PostInsightsDialog media={media} />
      </CardContent>
    </Card>
  );
}

function InstagramPostsTab({
  organizationId,
  initialMedia,
}: {
  organizationId: string;
  initialMedia: { items: InstagramMedia[]; nextCursor: string | null };
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
          <PostCard key={media.id} media={media} />
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

function ConversationListItem({
  conversation,
  active,
  onSelect,
}: {
  conversation: InstagramConversation;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-border/60 p-3 text-left transition-colors last:border-b-0 hover:bg-accent ${
        active ? "bg-accent" : ""
      }`}
    >
      <Avatar>
        <AvatarFallback>{initial(conversation.participantUsername)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{conversation.participantUsername ?? "Unknown"}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.updatedTime)}</span>
        </div>
        {conversation.snippet && <p className="truncate text-xs text-muted-foreground">{conversation.snippet}</p>}
      </div>
    </button>
  );
}

function ConversationThread({
  organizationId,
  conversation,
  profileUsername,
  onBack,
}: {
  organizationId: string;
  conversation: InstagramConversation;
  profileUsername: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, startSending] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getInstagramConversationMessages(organizationId, conversation.id)
      .then(setMessages)
      .finally(() => setLoading(false));
    // ConversationThread is remounted (via `key`) whenever the selected
    // conversation changes, so initial state already covers loading/reply —
    // this effect only needs to run the fetch once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  function handleSend() {
    if (!conversation.participantId || !reply.trim()) return;
    const text = reply.trim();
    startSending(async () => {
      const result = await sendInstagramReply(organizationId, conversation.participantId as string, text);
      if (result.error) {
        setError(result.error);
        return;
      }
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
        <p className="font-medium">{conversation.participantUsername ?? "Unknown"}</p>
      </div>

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

      {conversation.participantId ? (
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
      ) : (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Can&apos;t identify the recipient for this conversation — replying isn&apos;t available.
        </p>
      )}
    </div>
  );
}

function InstagramMessagesTab({
  organizationId,
  profileUsername,
  initialConversations,
}: {
  organizationId: string;
  profileUsername: string;
  initialConversations: { items: InstagramConversation[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialConversations.items);
  const [cursor, setCursor] = useState(initialConversations.nextCursor);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreInstagramConversations(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No conversations yet. Messages sent to your Instagram account will show up here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex h-[34rem]">
        <div
          className={`w-full flex-col border-border sm:w-80 sm:flex-none sm:border-r ${
            selected ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="flex-1 overflow-y-auto">
            {items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selectedId}
                onSelect={() => setSelectedId(conversation.id)}
              />
            ))}
          </div>
          {cursor && (
            <div className="border-t border-border p-2">
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
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>
    </Card>
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
        </TabsList>
        <TabsPanel value="posts">
          <InstagramPostsTab organizationId={organizationId} initialMedia={data.media} />
        </TabsPanel>
        <TabsPanel value="insights">
          <InstagramInsightsTab profile={data.profile} insights={data.insights} />
        </TabsPanel>
        <TabsPanel value="messages">
          <InstagramMessagesTab
            organizationId={organizationId}
            profileUsername={data.profile.username}
            initialConversations={data.conversations}
          />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
