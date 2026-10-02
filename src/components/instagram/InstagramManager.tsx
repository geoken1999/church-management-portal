"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  Eye,
  Users,
  TrendingUp,
  UserPlus,
  MousePointerClick,
  Images,
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
  getInstagramAiTypingState,
  listCommentAutomations,
  addCommentAutomation,
  toggleCommentAutomation,
  removeCommentAutomation,
  uploadInstagramPost,
  type UploadPostState,
  switchInstagramAccount,
} from "@/lib/instagram/actions";
import type { InstagramConnectionSummary, InstagramDashboardData, InstagramAccountOption } from "@/lib/instagram/dal";
import type {
  InstagramMedia,
  InstagramInsightValue,
  InstagramDailyInsight,
  InstagramConversation,
  InstagramMessage,
} from "@/lib/instagram/client";
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
  DialogFooter,
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
const CONVERSATION_LIST_POLL_MS = 15_000;
const MESSAGE_THREAD_POLL_MS = 4_000;
const AI_TYPING_POLL_MS = 2_000;

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
// Account switcher
// ---------------------------------------------------------------------------

// Same pattern as YouTube's own ChannelSwitcher — an org can have several
// connected Instagram accounts at once (plan-gated), one of which is
// active at a time. Automated behavior (AI replies, comment automations)
// runs for every connected account regardless of which is active; this
// only controls which one the dashboard displays.
function AccountSwitcher({
  organizationId,
  accounts,
  canManage,
}: {
  organizationId: string;
  accounts: InstagramAccountOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (accounts.length <= 1 && !canManage) return null;

  function handleSwitch(account: InstagramAccountOption) {
    if (account.isActive || switchingId) return;
    setError(null);
    setSwitchingId(account.id);
    startTransition(async () => {
      const result = await switchInstagramAccount(organizationId, account.id);
      setSwitchingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => handleSwitch(account)}
            disabled={switchingId !== null}
            className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:opacity-60 ${
              account.isActive
                ? "border-primary bg-primary/5 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {account.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.profilePictureUrl} alt={account.username} className="size-5 shrink-0 rounded-full object-cover" />
            ) : (
              <InstagramIcon className="size-4 shrink-0" />
            )}
            <span className="max-w-40 truncate">@{account.username}</span>
            {switchingId === account.id && <span className="text-xs text-muted-foreground">Switching...</span>}
          </button>
        ))}
        {canManage && (
          <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href="/api/instagram/connect" />}>
            <Plus className="size-3.5" />
            Add account
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
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
              <input type="hidden" name="connectionId" value={profile.id} />
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

const UPLOAD_POST_INITIAL_STATE: UploadPostState = {};

// Publishing is the one capability Instagram's API actually supports for
// this app's product — no edit or delete to pair with it (see the doc
// comment on createMediaContainer in client.ts), so this is just an upload
// form, not a fuller "manage this post" dialog.
function UploadPostDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<UploadPostState>(UPLOAD_POST_INITIAL_STATE);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadInstagramPost(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        setPreview(null);
        formRef.current?.reset();
      }
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setClientError(undefined);
    if (!file) {
      setPreview(null);
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setClientError("Image must be a JPEG or PNG.");
      e.target.value = "";
      setPreview(null);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setClientError("Image must be smaller than 25MB.");
      e.target.value = "";
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  const error = clientError ?? state.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(UPLOAD_POST_INITIAL_STATE);
          setClientError(undefined);
        } else {
          setPreview(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button"><Plus className="size-4" />Upload post</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new post</DialogTitle>
          <DialogDescription>
            Publishes directly to your connected Instagram account. There&apos;s no undo via this app — to remove
            or change it afterward, use the Instagram app directly.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="space-y-1.5">
            <Label htmlFor="post-image">Image (JPEG or PNG)</Label>
            <Input id="post-image" name="image" type="file" accept="image/jpeg,image/png" onChange={handleFileChange} required />
          </div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" className="aspect-square w-full rounded-lg object-cover" />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="post-caption">Caption (optional)</Label>
            <Textarea id="post-caption" name="caption" rows={3} placeholder="Write a caption..." />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <div className="space-y-4">
        {canManage && (
          <div className="flex justify-end">
            <UploadPostDialog organizationId={organizationId} />
          </div>
        )}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No posts yet.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <UploadPostDialog organizationId={organizationId} />
        </div>
      )}
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

const STAT_ICONS: Record<string, typeof Eye> = {
  followers: Users,
  media_count: Images,
  reach: Eye,
  profile_views: MousePointerClick,
  accounts_engaged: UserPlus,
  total_interactions: Heart,
};

function StatCard({ name, label, value }: { name: string; label: string; value: number }) {
  const Icon = STAT_ICONS[name] ?? TrendingUp;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 py-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A thin-lined area chart with a gradient fill and a hover crosshair +
// tooltip — single series, so per the usual chart convention a legend box
// would be redundant; the title above it already names it. Colors come
// from the app's own --primary token rather than an invented palette,
// since a single-series chart has no categorical-hue assignment to make.
function TrendAreaChart({ data, valueLabel }: { data: { label: string; value: number }[]; valueLabel: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 600;
  const height = 180;
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period yet.</p>;
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  function xFor(i: number): number {
    return padding.left + (data.length === 1 ? innerWidth / 2 : (i / (data.length - 1)) * innerWidth);
  }
  function yFor(value: number): number {
    return padding.top + innerHeight - ((value - min) / range) * innerHeight;
  }

  const linePoints = data.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(" ");
  const areaPoints = `${xFor(0)},${yFor(min)} ${linePoints} ${xFor(data.length - 1)},${yFor(min)}`;
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (data.length - 1));
    setHoverIndex(Math.max(0, Math.min(data.length - 1, index)));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" preserveAspectRatio="none" height={height}>
        <defs>
          <linearGradient id="reach-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padding.left} y1={yFor(min)} x2={width - padding.right} y2={yFor(min)} stroke="var(--border)" strokeWidth="1" />
        <polygon points={areaPoints} fill="url(#reach-area-fill)" />
        <polyline points={linePoints} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIndex !== null && (
          <line
            x1={xFor(hoverIndex)}
            y1={padding.top}
            x2={xFor(hoverIndex)}
            y2={yFor(min)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}
        {data.map((d, i) => (
          <circle
            key={d.label}
            cx={xFor(i)}
            cy={yFor(d.value)}
            r={i === hoverIndex ? 4 : 0}
            fill="var(--primary)"
            className="transition-all"
          />
        ))}
        {/* Only first/last/hover labels, to avoid crowding a 14-point axis. */}
        <text x={xFor(0)} y={height - 6} fontSize="10" fill="var(--muted-foreground)">
          {data[0].label}
        </text>
        <text x={xFor(data.length - 1)} y={height - 6} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
          {data[data.length - 1].label}
        </text>
        <rect
          x={padding.left}
          y={0}
          width={innerWidth}
          height={height}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-sm"
          style={{ left: `${(xFor(hoverIndex as number) / width) * 100}%` }}
        >
          <p className="font-medium text-popover-foreground">
            {hovered.value.toLocaleString()} {valueLabel}
          </p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}

// Bars anchored to a zero baseline so a negative value (net unfollows that
// day) reads correctly below the line, not just as a short bar.
function DailyBarChart({ data, valueLabel }: { data: { label: string; value: number }[]; valueLabel: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period yet.</p>;
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="relative">
      <div className="flex h-36 items-center gap-1">
        {data.map((d, i) => {
          const heightPercent = (Math.abs(d.value) / maxAbs) * 100;
          return (
            <button
              key={d.label}
              type="button"
              className="group flex h-full flex-1 flex-col items-center justify-center"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
            >
              <div className="flex h-full w-full flex-col justify-end">
                <div
                  className={`w-full rounded-t-sm transition-colors ${
                    i === hoverIndex ? "bg-primary" : "bg-primary/60 group-hover:bg-primary"
                  }`}
                  style={{ height: `${Math.max(heightPercent, 3)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-sm">
          <p className="font-medium text-popover-foreground">
            {hovered.value > 0 ? "+" : ""}
            {hovered.value.toLocaleString()} {valueLabel}
          </p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}

// Horizontal bars, longest first — built entirely from data the Posts tab
// already fetched (no extra API calls), so this works even on plans/accounts
// where per-post insights calls are otherwise rate-limited.
function TopPostsChart({ media }: { media: InstagramMedia[] }) {
  const top = [...media]
    .map((m) => ({ ...m, engagement: m.likeCount + m.commentsCount }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  if (top.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No posts yet.</p>;
  }

  const max = Math.max(...top.map((m) => m.engagement), 1);

  return (
    <div className="space-y-3">
      {top.map((m) => (
        <a
          key={m.id}
          href={m.permalink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-accent"
        >
          {(m.thumbnailUrl ?? m.mediaUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.thumbnailUrl ?? m.mediaUrl ?? undefined}
              alt={m.caption ?? "Instagram post"}
              className="size-10 shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{m.caption ?? "Untitled post"}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(m.engagement / max) * 100}%` }} />
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">{m.engagement.toLocaleString()}</span>
        </a>
      ))}
    </div>
  );
}

function InstagramInsightsTab({
  profile,
  insights,
  dailyInsights,
  media,
}: {
  profile: InstagramConnectionSummary;
  insights: InstagramInsightValue[];
  dailyInsights: InstagramDailyInsight[];
  media: InstagramMedia[];
}) {
  const stats = [
    { name: "followers", value: profile.followersCount ?? 0 },
    { name: "media_count", value: profile.mediaCount ?? 0 },
    ...insights,
  ];
  const statLabels: Record<string, string> = { followers: "Followers", media_count: "Total posts" };

  const reachSeries = dailyInsights.map((d) => ({ label: formatChartDate(d.date), value: d.reach }));
  const followerSeries = dailyInsights.map((d) => ({ label: formatChartDate(d.date), value: d.followerChange }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.name} name={stat.name} label={statLabels[stat.name] ?? insightLabel(stat.name)} value={stat.value} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reach — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendAreaChart data={reachSeries} valueLabel="accounts reached" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Follower growth — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBarChart data={followerSeries} valueLabel="followers" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top posts by engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <TopPostsChart media={media} />
        </CardContent>
      </Card>
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
  const [aiTyping, setAiTyping] = useState(false);
  const showTyping = aiMode && aiTyping;
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
  }, [messages, loading, showTyping]);

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

  // Only polled while AI mode is actually on — there's nothing to show
  // otherwise, no point spending a request every 2s on it. Render sites
  // below check `aiMode && aiTyping` rather than resetting this state here
  // when AI mode turns off, to avoid a synchronous setState-in-effect.
  useEffect(() => {
    if (!aiMode || !conversation.participantId) return;
    const participantId = conversation.participantId;
    function poll() {
      getInstagramAiTypingState(organizationId, participantId).then(setAiTyping);
    }
    poll();
    const interval = setInterval(poll, AI_TYPING_POLL_MS);
    return () => clearInterval(interval);
  }, [aiMode, organizationId, conversation.participantId]);

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
        {showTyping && (
          <div className="flex justify-end">
            <div className="flex items-center gap-1 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
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
            placeholder={showTyping ? "AI is replying..." : "Type a reply..."}
            rows={1}
            disabled={showTyping}
            className="max-h-32 flex-1 resize-none"
          />
          <Button type="button" size="icon" onClick={handleSend} disabled={sending || showTyping || !reply.trim()}>
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

// The full Messages experience as its own standalone unit (list + thread +
// floating pop-out), used by the /instagram-messages popup window. Not just
// InstagramMessagesTab alone — that tab's own "pop out" button needs
// somewhere to render its floating window, which the embedded version gets
// from the root InstagramManager; this is that same wiring, self-contained,
// so pop-out still works inside the popup window instead of silently doing
// nothing (there's no outer InstagramManager root there to host it).
export function InstagramMessagesStandalone({
  organizationId,
  profileUsername,
  initialConversations,
}: {
  organizationId: string;
  profileUsername: string;
  initialConversations: { items: InstagramConversation[]; nextCursor: string | null };
}) {
  const [poppedOut, setPoppedOut] = useState<InstagramConversation | null>(null);

  return (
    <div className="relative h-dvh">
      <InstagramMessagesTab
        organizationId={organizationId}
        profileUsername={profileUsername}
        initialConversations={initialConversations}
        onPopOut={setPoppedOut}
        fullHeight
      />
      {poppedOut && (
        <FloatingChatWindow
          organizationId={organizationId}
          conversation={poppedOut}
          profileUsername={profileUsername}
          onClose={() => setPoppedOut(null)}
        />
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
  accounts,
}: {
  organizationId: string;
  canManage: boolean;
  data: InstagramDashboardData;
  accounts: InstagramAccountOption[];
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
      <AccountSwitcher organizationId={organizationId} accounts={accounts} canManage={canManage} />
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
          <InstagramInsightsTab
            profile={data.profile}
            insights={data.insights}
            dailyInsights={data.dailyInsights}
            media={data.media.items}
          />
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
