"use client";

import { useState, useTransition } from "react";
import { Eye, ThumbsUp, MessageCircle, ExternalLink, RefreshCw, Send, AlertTriangle } from "lucide-react";
import { YouTubeIcon } from "@/components/icons/YouTubeIcon";
import {
  disconnectYouTube,
  loadMoreYouTubeVideos,
  loadMoreYouTubeComments,
  replyToYouTubeComment,
} from "@/lib/youtube/actions";
import type { YouTubeConnectionSummary, YouTubeDashboardData } from "@/lib/youtube/dal";
import type { YouTubeVideo, YouTubeAnalyticsValue, YouTubeComment } from "@/lib/youtube/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const ANALYTICS_LABELS: Record<string, string> = {
  views: "Views",
  estimatedMinutesWatched: "Minutes watched",
  subscribersGained: "Subscribers gained",
  subscribersLost: "Subscribers lost",
  likes: "Likes",
  comments: "Comments",
};

function analyticsLabel(name: string): string {
  return ANALYTICS_LABELS[name] ?? name;
}

function timeAgo(iso: string): string {
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

function ConnectYouTubeCard({ canManage }: { canManage: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <YouTubeIcon className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-heading text-base font-bold">Connect your YouTube channel</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            View videos, channel analytics, and comments from your YouTube channel right here — no need to switch
            apps.
          </p>
        </div>
        {canManage ? (
          <Button type="button" render={<a href="/api/youtube/connect" />}>
            <YouTubeIcon className="size-4" />
            Connect YouTube
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an admin to connect your YouTube channel.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function YouTubeHeader({
  organizationId,
  channel,
  syncError,
  canManage,
}: {
  organizationId: string;
  channel: YouTubeConnectionSummary;
  syncError: boolean;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {channel.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.thumbnailUrl}
              alt={channel.channelTitle}
              className="size-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent">
              <YouTubeIcon className="size-5 text-accent-foreground" />
            </div>
          )}
          <div>
            <p className="font-heading text-base font-bold">{channel.channelTitle}</p>
            <p className="text-sm text-muted-foreground">
              {(channel.subscriberCount ?? 0).toLocaleString()} subscribers ·{" "}
              {(channel.videoCount ?? 0).toLocaleString()} videos
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" render={<a href="/api/youtube/connect" />}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
            <form action={disconnectYouTube}>
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
              Couldn&apos;t sync with YouTube — the connection may have expired.{" "}
              {canManage ? 'Click "Reconnect" above to restore it.' : "Ask an admin to reconnect it."}
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

function VideoCard({ video }: { video: YouTubeVideo }) {
  return (
    <Card>
      <CardContent className="space-y-2.5">
        {video.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="aspect-video w-full rounded-lg object-cover"
          />
        )}
        <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Eye className="size-3.5" />
              {video.viewCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-3.5" />
              {video.likeCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3.5" />
              {video.commentCount.toLocaleString()}
            </span>
          </div>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${video.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          View on YouTube
          <ExternalLink className="size-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}

function YouTubeVideosTab({
  organizationId,
  initialVideos,
}: {
  organizationId: string;
  initialVideos: { items: YouTubeVideo[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialVideos.items);
  const [cursor, setCursor] = useState(initialVideos.nextCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreYouTubeVideos(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No videos yet.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((video) => (
          <VideoCard key={video.id} video={video} />
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
// Analytics
// ---------------------------------------------------------------------------

function YouTubeAnalyticsTab({
  channel,
  analytics,
}: {
  channel: YouTubeConnectionSummary;
  analytics: YouTubeAnalyticsValue[];
}) {
  const stats = [
    { name: "subscribers", value: channel.subscriberCount ?? 0 },
    { name: "total_views", value: channel.viewCount ?? 0 },
    { name: "video_count", value: channel.videoCount ?? 0 },
    ...analytics,
  ];
  const statLabels: Record<string, string> = {
    subscribers: "Subscribers",
    total_views: "Lifetime views",
    video_count: "Total videos",
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Last 28 days, plus lifetime channel totals.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{statLabels[stat.name] ?? analyticsLabel(stat.name)}</p>
              <p className="mt-1 text-2xl font-bold">{stat.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentReplyDialog({
  organizationId,
  comment,
}: {
  organizationId: string;
  comment: YouTubeComment;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    if (!reply.trim()) return;
    startTransition(async () => {
      const result = await replyToYouTubeComment(organizationId, comment.id, reply.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
      setError(undefined);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReply("");
          setError(undefined);
          setSent(false);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm">Reply</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reply to {comment.authorName}</DialogTitle>
          <DialogDescription>{comment.text}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {sent ? (
          <p className="text-sm text-muted-foreground">Reply posted.</p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply..."
              rows={2}
              className="flex-1"
            />
            <Button type="button" size="icon" onClick={handleSend} disabled={pending || !reply.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommentCard({ organizationId, comment }: { organizationId: string; comment: YouTubeComment }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {comment.authorProfileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.authorProfileImageUrl}
            alt={comment.authorName}
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="size-8 shrink-0 rounded-full bg-accent" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{comment.authorName}</p>
            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(comment.publishedAt)}</span>
          </div>
          <p className="text-sm text-muted-foreground">{comment.text}</p>
          <div className="flex items-center gap-3 pt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ThumbsUp className="size-3" />
              {comment.likeCount}
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${comment.videoId}&lc=${comment.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary hover:underline"
            >
              View on YouTube
            </a>
            {comment.canReply && <CommentReplyDialog organizationId={organizationId} comment={comment} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function YouTubeCommentsTab({
  organizationId,
  initialComments,
}: {
  organizationId: string;
  initialComments: { items: YouTubeComment[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialComments.items);
  const [cursor, setCursor] = useState(initialComments.nextCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreYouTubeComments(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No comments yet. Comments on your videos will show up here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((comment) => (
        <CommentCard key={comment.id} organizationId={organizationId} comment={comment} />
      ))}
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

export function YouTubeManager({
  organizationId,
  canManage,
  data,
}: {
  organizationId: string;
  canManage: boolean;
  data: YouTubeDashboardData;
}) {
  if (!data.connected) {
    return <ConnectYouTubeCard canManage={canManage} />;
  }

  return (
    <div className="space-y-4">
      <YouTubeHeader
        organizationId={organizationId}
        channel={data.channel}
        syncError={data.syncError}
        canManage={canManage}
      />

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="videos">Videos</TabsTab>
          <TabsTab value="analytics">Analytics</TabsTab>
          <TabsTab value="comments">Comments</TabsTab>
        </TabsList>
        <TabsPanel value="videos">
          <YouTubeVideosTab organizationId={organizationId} initialVideos={data.videos} />
        </TabsPanel>
        <TabsPanel value="analytics">
          <YouTubeAnalyticsTab channel={data.channel} analytics={data.analytics} />
        </TabsPanel>
        <TabsPanel value="comments">
          <YouTubeCommentsTab organizationId={organizationId} initialComments={data.comments} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
