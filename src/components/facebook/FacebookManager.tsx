"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  ExternalLink,
  RefreshCw,
  Send,
  AlertTriangle,
  CircleCheck,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { FacebookIcon } from "@/components/icons/FacebookIcon";
import {
  disconnectFacebook,
  getPendingFacebookPages,
  selectFacebookPage,
  loadMoreFacebookPosts,
  createFacebookPost,
  createFacebookPhotoPost,
  updateFacebookPost,
  deleteFacebookPost,
  loadMoreFacebookConversations,
  getFacebookConversationMessages,
  sendFacebookReply,
  type PendingFacebookPage,
} from "@/lib/facebook/actions";
import type { FacebookConnectionSummary, FacebookDashboardData } from "@/lib/facebook/dal";
import type { FacebookPost, FacebookInsightValue, FacebookConversation, FacebookMessage } from "@/lib/facebook/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";

const INSIGHT_LABELS: Record<string, string> = {
  page_impressions: "Impressions",
  page_post_engagements: "Post engagements",
  page_views_total: "Page views",
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
// Not connected / choose a Page
// ---------------------------------------------------------------------------

function ConnectFacebookCard({ canManage }: { canManage: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <FacebookIcon className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-heading text-base font-bold">Connect your Facebook Page</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            View posts, insights, and messages from your Facebook Page right here — no need to switch apps.
          </p>
        </div>
        {canManage ? (
          <Button type="button" nativeButton={false} render={<a href="/api/facebook/connect" />}>
            <FacebookIcon className="size-4" />
            Connect Facebook
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an admin to connect your Facebook Page.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChoosePageCard({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pages, setPages] = useState<PendingFacebookPage[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (pages === null) {
    getPendingFacebookPages().then(setPages);
  }

  function handleSelect(pageId: string) {
    startTransition(async () => {
      const result = await selectFacebookPage(organizationId, pageId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/dashboard/facebook?status=connected");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div>
          <h3 className="font-heading text-base font-bold">Choose a Page to connect</h3>
          <p className="text-sm text-muted-foreground">Your Facebook account manages more than one Page.</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pages === null && <p className="text-sm text-muted-foreground">Loading your Pages...</p>}
        {pages?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            That selection expired.{" "}
            <a href="/api/facebook/connect" className="font-medium text-primary underline">
              Try connecting again
            </a>
            .
          </p>
        )}

        <div className="space-y-2">
          {pages?.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => handleSelect(page.id)}
              disabled={pending}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              {page.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.pictureUrl} alt={page.name} className="size-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
                  <FacebookIcon className="size-4 text-accent-foreground" />
                </div>
              )}
              <span className="font-medium">{page.name}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function FacebookHeader({
  organizationId,
  page,
  syncError,
  canManage,
}: {
  organizationId: string;
  page: FacebookConnectionSummary;
  syncError: boolean;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {page.pagePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.pagePictureUrl} alt={page.pageName} className="size-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent">
              <FacebookIcon className="size-5 text-accent-foreground" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-heading text-base font-bold">{page.pageName}</p>
              {syncError ? (
                <Badge variant="destructive">Needs reconnect</Badge>
              ) : (
                <Badge variant="secondary">
                  <CircleCheck className="size-3" />
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {(page.fanCount ?? 0).toLocaleString()} followers · connected {new Date(page.connectedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href="/api/facebook/connect" />}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
            <form action={disconnectFacebook}>
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
              Couldn&apos;t sync with Facebook — the connection may have expired.{" "}
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

function EditPostDialog({
  organizationId,
  post,
  onUpdated,
}: {
  organizationId: string;
  post: FacebookPost;
  onUpdated: (id: string, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(post.message ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateFacebookPost(organizationId, post.id, message);
      if (result.error) {
        setError(result.error);
        return;
      }
      onUpdated(post.id, message.trim());
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMessage(post.message ?? "");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm">Edit</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription>Update this post&apos;s text.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={pending || !message.trim()}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePostDialog({ organizationId, post, onDeleted }: { organizationId: string; post: FacebookPost; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteFacebookPost(organizationId, post.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDeleted(post.id);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setError(undefined); }}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm">Delete</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete post?</DialogTitle>
          <DialogDescription>This will be permanently deleted from your Facebook Page.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting..." : "Delete post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostCard({
  organizationId,
  post,
  canManage,
  onUpdated,
  onDeleted,
}: {
  organizationId: string;
  post: FacebookPost;
  canManage: boolean;
  onUpdated: (id: string, message: string) => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2.5">
        {post.fullPicture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.fullPicture} alt="" className="aspect-video w-full rounded-lg object-cover" />
        )}
        {post.message && <p className="line-clamp-3 text-sm">{post.message}</p>}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="size-3.5" />
            {post.likeCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            {post.commentCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Share2 className="size-3.5" />
            {post.shareCount.toLocaleString()}
          </span>
          <span className="ml-auto text-xs">{timeAgo(post.createdTime)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          {post.permalinkUrl ? (
            <a
              href={post.permalinkUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              View on Facebook
              <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span />
          )}
          {canManage && (
            <div className="flex items-center gap-1">
              <EditPostDialog organizationId={organizationId} post={post} onUpdated={onUpdated} />
              <DeletePostDialog organizationId={organizationId} post={post} onDeleted={onDeleted} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type CreatePostView = "text" | "photo";

function CreatePostDialog({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CreatePostView>("text");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setView("text");
      setMessage("");
      setPhoto(null);
      setError(undefined);
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const result =
        view === "photo" && photo
          ? await (async () => {
              const formData = new FormData();
              formData.set("photo", photo);
              return createFacebookPhotoPost(organizationId, message, formData);
            })()
          : await createFacebookPost(organizationId, message);

      if (result.error) {
        setError(result.error);
        return;
      }
      onCreated();
      setOpen(false);
    });
  }

  const canSubmit = view === "photo" ? Boolean(photo) : Boolean(message.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button">Create post</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a post</DialogTitle>
          <DialogDescription>Publish directly to your Facebook Page.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="button" variant={view === "text" ? "default" : "outline"} size="sm" onClick={() => setView("text")}>
            Text
          </Button>
          <Button type="button" variant={view === "photo" ? "default" : "outline"} size="sm" onClick={() => setView("photo")}>
            <ImageIcon className="size-3.5" />
            Photo
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-message">{view === "photo" ? "Caption (optional)" : "Message"}</Label>
          <Textarea
            id="post-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="What's happening at your church?"
          />
        </div>

        {view === "photo" && (
          <div className="space-y-2">
            <Label htmlFor="post-photo">Photo</Label>
            <input
              ref={inputRef}
              id="post-photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
              <Upload className="size-4" />
              {photo ? photo.name : "Choose a photo"}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={pending || !canSubmit}>
            {pending ? "Publishing..." : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FacebookPostsTab({
  organizationId,
  canManage,
  initialPosts,
}: {
  organizationId: string;
  canManage: boolean;
  initialPosts: { items: FacebookPost[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialPosts.items);
  const [cursor, setCursor] = useState(initialPosts.nextCursor);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreFacebookPosts(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  function refreshFromStart() {
    startRefresh(async () => {
      const page = await loadMoreFacebookPosts(organizationId);
      setItems((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const fresh = page.items.filter((p) => !existingIds.has(p.id));
        return [...fresh, ...prev];
      });
    });
  }

  function handleUpdated(id: string, message: string) {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, message } : p)));
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={refreshFromStart}
          disabled={refreshing}
          aria-label="Refresh posts"
        >
          <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
        </Button>
        {canManage && <CreatePostDialog organizationId={organizationId} onCreated={refreshFromStart} />}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No posts yet.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((post) => (
            <PostCard
              key={post.id}
              organizationId={organizationId}
              post={post}
              canManage={canManage}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

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

function FacebookInsightsTab({
  page,
  insights,
}: {
  page: FacebookConnectionSummary;
  insights: FacebookInsightValue[];
}) {
  const stats = [{ name: "followers", value: page.fanCount ?? 0 }, ...insights];
  const statLabels: Record<string, string> = { followers: "Followers" };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Last 28 days, plus lifetime followers.</p>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function ConversationThreadDialog({
  organizationId,
  conversation,
}: {
  organizationId: string;
  conversation: FacebookConversation;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<FacebookMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, startSending] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setReply("");
      setLoading(true);
      getFacebookConversationMessages(organizationId, conversation.id)
        .then(setMessages)
        .finally(() => setLoading(false));
    }
  }

  function handleSend() {
    if (!conversation.participantId || !reply.trim()) return;
    const text = reply.trim();
    startSending(async () => {
      const result = await sendFacebookReply(organizationId, conversation.participantId as string, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, fromName: "You", text, createdTime: new Date().toISOString() },
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
              <p className="font-medium">{conversation.participantName ?? "Unknown"}</p>
              {conversation.snippet && (
                <p className="truncate text-sm text-muted-foreground">{conversation.snippet}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.updatedTime)}</span>
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conversation.participantName ?? "Conversation"}</DialogTitle>
          <DialogDescription>Messages sync live from Facebook.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Loading messages...</p>}
          {!loading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
          )}
          {messages.map((message) => {
            const isOwn = message.fromName === "You";
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

function FacebookMessagesTab({
  organizationId,
  initialConversations,
}: {
  organizationId: string;
  initialConversations: { items: FacebookConversation[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialConversations.items);
  const [cursor, setCursor] = useState(initialConversations.nextCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreFacebookConversations(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No conversations yet. Messages sent to your Page will show up here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          {items.map((conversation) => (
            <ConversationThreadDialog key={conversation.id} organizationId={organizationId} conversation={conversation} />
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

export function FacebookManager({
  organizationId,
  canManage,
  status,
  data,
}: {
  organizationId: string;
  canManage: boolean;
  status?: string;
  data: FacebookDashboardData;
}) {
  if (status === "choose_page") {
    return <ChoosePageCard organizationId={organizationId} />;
  }

  if (!data.connected) {
    return <ConnectFacebookCard canManage={canManage} />;
  }

  return (
    <div className="space-y-4">
      <FacebookHeader organizationId={organizationId} page={data.page} syncError={data.syncError} canManage={canManage} />

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="posts">Posts</TabsTab>
          <TabsTab value="insights">Insights</TabsTab>
          <TabsTab value="messages">Messages</TabsTab>
        </TabsList>
        <TabsPanel value="posts">
          <FacebookPostsTab organizationId={organizationId} canManage={canManage} initialPosts={data.posts} />
        </TabsPanel>
        <TabsPanel value="insights">
          <FacebookInsightsTab page={data.page} insights={data.insights} />
        </TabsPanel>
        <TabsPanel value="messages">
          <FacebookMessagesTab organizationId={organizationId} initialConversations={data.conversations} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
