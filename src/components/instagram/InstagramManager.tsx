"use client";

import { useState, useTransition } from "react";
import {
  Heart,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Send,
  ChevronRight,
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
          <Button type="button" render={<a href="/api/instagram/connect" />}>
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
            <Button type="button" variant="outline" size="sm" render={<a href="/api/instagram/connect" />}>
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

function ConversationThreadDialog({
  organizationId,
  conversation,
  profileUsername,
}: {
  organizationId: string;
  conversation: InstagramConversation;
  profileUsername: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, startSending] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setReply("");
      setLoading(true);
      getInstagramConversationMessages(organizationId, conversation.id)
        .then(setMessages)
        .finally(() => setLoading(false));
    }
  }

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="font-medium">{conversation.participantUsername ?? "Unknown"}</p>
              {conversation.snippet && (
                <p className="truncate text-sm text-muted-foreground">{conversation.snippet}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{timeAgo(conversation.updatedTime)}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conversation.participantUsername ?? "Conversation"}</DialogTitle>
          <DialogDescription>Messages sync live from Instagram.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Loading messages...</p>}
          {!loading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
          )}
          {messages.map((message) => {
            const isOwn = message.fromUsername === profileUsername;
            return (
              <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                    isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {conversation.participantId ? (
          <div className="flex items-end gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply..."
              rows={2}
              className="flex-1"
            />
            <Button type="button" size="icon" onClick={handleSend} disabled={sending || !reply.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Can&apos;t identify the recipient for this conversation — replying isn&apos;t available.
          </p>
        )}
      </DialogContent>
    </Dialog>
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
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          {items.map((conversation) => (
            <ConversationThreadDialog
              key={conversation.id}
              organizationId={organizationId}
              conversation={conversation}
              profileUsername={profileUsername}
            />
          ))}
        </CardContent>
      </Card>
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
