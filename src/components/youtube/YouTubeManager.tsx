"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import {
  Eye,
  ThumbsUp,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Send,
  AlertTriangle,
  CircleCheck,
  Radio,
  CalendarClock,
  Lock,
  EyeOff,
  Trophy,
  Video,
  Copy,
  Check,
  Search,
  Upload,
} from "lucide-react";
import { YouTubeIcon } from "@/components/icons/YouTubeIcon";
import {
  disconnectYouTube,
  loadMoreYouTubeVideos,
  loadMoreYouTubeComments,
  replyToYouTubeComment,
  getYouTubeLiveStatus,
  startYouTubeBroadcast,
  goLiveYouTubeBroadcast,
  endYouTubeBroadcast,
  cancelYouTubeBroadcast,
  getYouTubeVideoDetails,
  updateYouTubeVideo,
  deleteYouTubeVideo,
  startYouTubeUpload,
  updateYouTubeThumbnail,
  notifyYouTubeVideoUploaded,
} from "@/lib/youtube/actions";
import type { YouTubeConnectionSummary, YouTubeDashboardData } from "@/lib/youtube/dal";
import { formatDuration } from "@/lib/youtube/format";
import type {
  YouTubeVideo,
  YouTubeAnalyticsValue,
  YouTubeComment,
  YouTubeBroadcast,
  YouTubeTopVideo,
  YouTubeManagedBroadcast,
  YouTubeStreamKey,
  YouTubePrivacyStatus,
  YouTubeVideoDetails,
  YouTubeContentType,
} from "@/lib/youtube/client";
import { ALLOWED_THUMBNAIL_TYPES, MAX_THUMBNAIL_BYTES } from "@/lib/youtube/validation";
import { FieldError } from "@/components/auth/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
          <Button type="button" nativeButton={false} render={<a href="/api/youtube/connect" />}>
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
            <div className="flex items-center gap-2">
              <p className="font-heading text-base font-bold">{channel.channelTitle}</p>
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
              {(channel.subscriberCount ?? 0).toLocaleString()} subscribers ·{" "}
              {(channel.videoCount ?? 0).toLocaleString()} videos · connected{" "}
              {new Date(channel.connectedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href="/api/youtube/connect" />}>
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
// Live & upcoming broadcasts
// ---------------------------------------------------------------------------

function BroadcastRow({ broadcast, live }: { broadcast: YouTubeBroadcast; live: boolean }) {
  const when = broadcast.scheduledStartTime
    ? new Date(broadcast.scheduledStartTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <a
      href={`https://www.youtube.com/watch?v=${broadcast.id}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
    >
      {broadcast.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="h-12 w-20 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-12 w-20 shrink-0 rounded bg-accent" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{broadcast.title}</p>
        <p className="text-xs text-muted-foreground">{live ? "Streaming now" : when}</p>
      </div>
    </a>
  );
}

function YouTubeLiveBanner({
  liveBroadcasts,
}: {
  liveBroadcasts: { live: YouTubeBroadcast[]; upcoming: YouTubeBroadcast[] };
}) {
  if (liveBroadcasts.live.length === 0 && liveBroadcasts.upcoming.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {liveBroadcasts.live.map((broadcast) => (
          <div key={broadcast.id} className="space-y-2">
            <Badge variant="destructive">
              <Radio className="size-3" />
              Live now
            </Badge>
            <BroadcastRow broadcast={broadcast} live />
          </div>
        ))}
        {liveBroadcasts.upcoming.length > 0 && (
          <div className="space-y-2">
            <Badge variant="secondary">
              <CalendarClock className="size-3" />
              Upcoming
            </Badge>
            {liveBroadcasts.upcoming.map((broadcast) => (
              <BroadcastRow key={broadcast.id} broadcast={broadcast} live={false} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

function privacyBadge(status: string): { label: string; icon: typeof Eye; variant: "secondary" | "outline" | "destructive" } {
  if (status === "private") return { label: "Private", icon: Lock, variant: "destructive" };
  if (status === "unlisted") return { label: "Unlisted", icon: EyeOff, variant: "outline" };
  return { label: "Public", icon: Eye, variant: "secondary" };
}

const CONTENT_TYPE_LABELS: Record<YouTubeContentType, string> = {
  video: "Video",
  short: "Short",
  live: "Live",
  unknown: "Unknown",
};

function contentTypeBadgeVariant(contentType: YouTubeContentType): "secondary" | "outline" | "destructive" {
  if (contentType === "live") return "destructive";
  if (contentType === "short") return "secondary";
  return "outline";
}

const PRIVACY_LABELS: Record<YouTubePrivacyStatus, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

interface VideoUpdate {
  id: string;
  title: string;
  privacyStatus: YouTubePrivacyStatus;
}

function EditVideoDialog({
  organizationId,
  video,
  onUpdated,
}: {
  organizationId: string;
  video: YouTubeVideo;
  onUpdated: (update: VideoUpdate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<YouTubeVideoDetails | null>(null);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<YouTubePrivacyStatus>(video.privacyStatus as YouTubePrivacyStatus);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(video.thumbnailUrl);
  const [thumbnailError, setThumbnailError] = useState<string | undefined>();
  const [thumbnailPending, startThumbnailTransition] = useTransition();
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setThumbnailError(undefined);
      setThumbnailPreview(video.thumbnailUrl);
      setLoading(true);
      getYouTubeVideoDetails(organizationId, video.id).then((result) => {
        if (result) {
          setDetails(result);
          setTitle(result.title);
          setDescription(result.description);
          setPrivacy(result.privacyStatus);
        }
        setLoading(false);
      });
    }
  }

  function handleSave() {
    if (!details || !title.trim()) return;
    startTransition(async () => {
      const result = await updateYouTubeVideo(organizationId, {
        id: video.id,
        title: title.trim(),
        description,
        categoryId: details.categoryId,
        privacyStatus: privacy,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onUpdated({ id: video.id, title: title.trim(), privacyStatus: privacy });
      setOpen(false);
    });
  }

  function handleThumbnailChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
      setThumbnailError("Thumbnail must be a JPEG, PNG, GIF, or BMP image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setThumbnailError(`Thumbnail must be smaller than ${Math.round(MAX_THUMBNAIL_BYTES / (1024 * 1024))}MB.`);
      e.target.value = "";
      return;
    }

    setThumbnailError(undefined);
    const previousPreview = thumbnailPreview;
    setThumbnailPreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.set("thumbnail", file);
    startThumbnailTransition(async () => {
      const result = await updateYouTubeThumbnail(organizationId, video.id, formData);
      if (result.error) {
        setThumbnailError(result.error);
        setThumbnailPreview(previousPreview);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            Edit
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit video</DialogTitle>
          <DialogDescription>Update this video&apos;s title, description, privacy, and thumbnail.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading video details...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <input
                ref={thumbnailInputRef}
                type="file"
                accept={ALLOWED_THUMBNAIL_TYPES.join(",")}
                className="hidden"
                onChange={handleThumbnailChange}
              />
              <button
                type="button"
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={thumbnailPending}
                className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {thumbnailPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailPreview} alt={video.title} className="size-full object-cover" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-sm font-medium text-white">
                    {thumbnailPending ? "Uploading..." : "Change thumbnail"}
                  </span>
                </span>
              </button>
              <FieldError id="thumbnail-error" message={thumbnailError} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-privacy">Privacy</Label>
              <Select value={privacy} onValueChange={(v) => setPrivacy((v ?? "public") as YouTubePrivacyStatus)}>
                <SelectTrigger id="edit-privacy" className="w-full">
                  <SelectValue>
                    {(v: string | null) => PRIVACY_LABELS[(v ?? "public") as YouTubePrivacyStatus]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIVACY_LABELS) as YouTubePrivacyStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PRIVACY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleSave} disabled={pending || !title.trim()}>
                {pending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteVideoDialog({
  organizationId,
  video,
  onDeleted,
}: {
  organizationId: string;
  video: YouTubeVideo;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteYouTubeVideo(organizationId, video.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDeleted(video.id);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete video?</DialogTitle>
          <DialogDescription>
            &quot;{video.title}&quot; will be permanently deleted from YouTube. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting..." : "Delete video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VideoCard({
  organizationId,
  video,
  canManage,
  onUpdated,
  onDeleted,
}: {
  organizationId: string;
  video: YouTubeVideo;
  canManage: boolean;
  onUpdated: (update: VideoUpdate) => void;
  onDeleted: (id: string) => void;
}) {
  const privacy = privacyBadge(video.privacyStatus);
  const PrivacyIcon = privacy.icon;
  const isShort = video.contentType === "short";

  return (
    <Card>
      <CardContent className="space-y-2.5">
        {video.thumbnailUrl && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className={isShort ? "mx-auto aspect-[9/16] w-1/2 rounded-lg object-cover" : "aspect-video w-full rounded-lg object-cover"}
            />
            {video.durationSeconds > 0 && (
              <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                {formatDuration(video.durationSeconds)}
              </span>
            )}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={privacy.variant}>
              <PrivacyIcon className="size-3" />
              {privacy.label}
            </Badge>
            <Badge variant={contentTypeBadgeVariant(video.contentType)}>{CONTENT_TYPE_LABELS[video.contentType]}</Badge>
          </div>
        </div>
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
        <div className="flex items-center justify-between gap-2">
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View on YouTube
            <ExternalLink className="size-3.5" />
          </a>
          {canManage && (
            <div className="flex items-center gap-1">
              <EditVideoDialog organizationId={organizationId} video={video} onUpdated={onUpdated} />
              <DeleteVideoDialog organizationId={organizationId} video={video} onDeleted={onDeleted} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// YouTube has no upload parameter to explicitly choose Shorts vs. a normal
// video — it's decided automatically from the file's own duration and
// aspect ratio after upload, with no way to override that. This predicts
// the same way client-side, from the file itself, purely so the admin
// knows what to expect before uploading rather than being surprised after.
const SHORTS_ELIGIBLE_MAX_SECONDS = 180;

function readVideoMetadata(file: File): Promise<{ durationSeconds: number; isPortraitOrSquare: boolean }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        durationSeconds: video.duration,
        isPortraitOrSquare: video.videoHeight >= video.videoWidth,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video file."));
    };
    video.src = url;
  });
}

function predictContentType(meta: { durationSeconds: number; isPortraitOrSquare: boolean }): "short" | "video" {
  const eligible = meta.durationSeconds > 0 && meta.durationSeconds <= SHORTS_ELIGIBLE_MAX_SECONDS;
  return eligible && meta.isPortraitOrSquare ? "short" : "video";
}

interface UploadResult {
  id: string;
}

// Uploads directly from the browser to Google's pre-authorized session URL
// (see startYouTubeUpload) — XMLHttpRequest is used instead of fetch
// specifically because fetch has no reliable upload-progress event.
function uploadFileToSession(uploadUrl: string, file: File, onProgress: (percent: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/*");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error("Upload finished, but the response couldn't be read."));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("A network error interrupted the upload."));
    xhr.send(file);
  });
}

type UploadDialogView = "form" | "uploading" | "done";

function UploadVideoDialog({ organizationId, onUploaded }: { organizationId: string; onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<UploadDialogView>("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<YouTubePrivacyStatus>("public");
  const [file, setFile] = useState<File | null>(null);
  const [predictedFormat, setPredictedFormat] = useState<"short" | "video" | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setView("form");
      setTitle("");
      setDescription("");
      setPrivacy("public");
      setFile(null);
      setPredictedFormat(null);
      setProgress(0);
      setError(undefined);
    }
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPredictedFormat(null);
    if (!selected) return;

    readVideoMetadata(selected)
      .then((meta) => setPredictedFormat(predictContentType(meta)))
      .catch(() => setPredictedFormat(null));
  }

  async function handleUpload() {
    if (!file || !title.trim()) return;
    setView("uploading");
    setError(undefined);
    setProgress(0);

    const result = await startYouTubeUpload(organizationId, {
      title: title.trim(),
      description,
      privacyStatus: privacy,
      fileSize: file.size,
      contentType: file.type || "video/*",
    });

    if (result.error || !result.uploadUrl) {
      setError(result.error ?? "Couldn't start the upload.");
      setView("form");
      return;
    }

    try {
      await uploadFileToSession(result.uploadUrl, file, setProgress);
      setView("done");
      onUploaded();
      notifyYouTubeVideoUploaded(organizationId, title.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "The upload failed.";
      // A generic XHR "error" event (rather than a proper HTTP error
      // status) is what the browser reports when it can't read the
      // response — often because Google's CORS headers weren't present on
      // this particular session, even though the video was still created
      // successfully on YouTube's side. Refresh so it shows up if so.
      if (message.toLowerCase().includes("network error")) {
        setError(`${message} The video may have still uploaded — check the list below before trying again.`);
        onUploaded();
      } else {
        setError(message);
      }
      setView("form");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Upload className="size-4" />
            Upload video
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a video</DialogTitle>
          <DialogDescription>
            {view === "done"
              ? "YouTube is processing your upload — it'll appear in the list shortly."
              : "Uploads go straight from your browser to YouTube — nothing passes through our server."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {view === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-title">Title</Label>
              <Input
                id="upload-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sunday Morning Service"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-description">Description (optional)</Label>
              <Textarea
                id="upload-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-privacy">Privacy</Label>
              <Select value={privacy} onValueChange={(v) => setPrivacy((v ?? "public") as YouTubePrivacyStatus)}>
                <SelectTrigger id="upload-privacy" className="w-full">
                  <SelectValue>
                    {(v: string | null) => PRIVACY_LABELS[(v ?? "public") as YouTubePrivacyStatus]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIVACY_LABELS) as YouTubePrivacyStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PRIVACY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-file">Video file</Label>
              <input
                ref={inputRef}
                id="upload-file"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
                <Upload className="size-4" />
                {file ? file.name : "Choose a video file"}
              </Button>
              {predictedFormat && (
                <p className="text-xs text-muted-foreground">
                  Likely to be treated as a{" "}
                  <span className="font-medium">{predictedFormat === "short" ? "Short" : "regular video"}</span> on
                  YouTube, based on its duration and aspect ratio — YouTube decides this automatically after upload
                  and it can&apos;t be manually overridden.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleUpload} disabled={!file || !title.trim()}>
                Start upload
              </Button>
            </DialogFooter>
          </div>
        )}

        {view === "uploading" && (
          <div className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-center text-sm text-muted-foreground">Uploading... {progress}%</p>
          </div>
        )}

        {view === "done" && (
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

type VideoPrivacyFilter = "all" | "public" | "unlisted" | "private";
type VideoFormatFilter = "all" | YouTubeContentType;
type VideoSort = "newest" | "oldest" | "most_viewed" | "most_liked" | "most_commented" | "longest" | "shortest";

const VIDEO_SORT_LABELS: Record<VideoSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  most_viewed: "Most viewed",
  most_liked: "Most liked",
  most_commented: "Most commented",
  longest: "Longest duration",
  shortest: "Shortest duration",
};

const VIDEO_PRIVACY_FILTER_LABELS: Record<VideoPrivacyFilter, string> = {
  all: "All",
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

const VIDEO_FORMAT_FILTER_LABELS: Record<VideoFormatFilter, string> = {
  all: "All formats",
  video: "Videos",
  short: "Shorts",
  live: "Live",
  unknown: "Unclassified",
};

function YouTubeVideosTab({
  organizationId,
  canManage,
  initialVideos,
}: {
  organizationId: string;
  canManage: boolean;
  initialVideos: { items: YouTubeVideo[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState(initialVideos.items);
  const [cursor, setCursor] = useState(initialVideos.nextCursor);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [privacyFilter, setPrivacyFilter] = useState<VideoPrivacyFilter>("all");
  const [formatFilter, setFormatFilter] = useState<VideoFormatFilter>("all");
  const [sortBy, setSortBy] = useState<VideoSort>("newest");

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreYouTubeVideos(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  // Prepends any videos from page 1 not already in the list — used both by
  // the manual refresh button and after an upload completes, since a brand
  // new upload isn't guaranteed to be indexed into the uploads playlist the
  // instant the resumable upload finishes.
  function refreshFromStart() {
    startRefresh(async () => {
      const page = await loadMoreYouTubeVideos(organizationId);
      setItems((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const fresh = page.items.filter((v) => !existingIds.has(v.id));
        return [...fresh, ...prev];
      });
    });
  }

  function handleVideoUpdated(update: VideoUpdate) {
    setItems((prev) =>
      prev.map((v) => (v.id === update.id ? { ...v, title: update.title, privacyStatus: update.privacyStatus } : v)),
    );
  }

  function handleVideoDeleted(id: string) {
    setItems((prev) => prev.filter((v) => v.id !== id));
  }

  // Search/filter/sort run over whatever pages have been loaded so far
  // (client-side) rather than re-querying YouTube — the Data API has no
  // title-search on a playlist short of the much costlier search.list.
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((video) => {
      if (privacyFilter !== "all" && video.privacyStatus !== privacyFilter) return false;
      if (formatFilter !== "all" && video.contentType !== formatFilter) return false;
      if (query && !video.title.toLowerCase().includes(query)) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
        break;
      case "most_viewed":
        sorted.sort((a, b) => b.viewCount - a.viewCount);
        break;
      case "most_liked":
        sorted.sort((a, b) => b.likeCount - a.likeCount);
        break;
      case "most_commented":
        sorted.sort((a, b) => b.commentCount - a.commentCount);
        break;
      case "longest":
        sorted.sort((a, b) => b.durationSeconds - a.durationSeconds);
        break;
      case "shortest":
        sorted.sort((a, b) => a.durationSeconds - b.durationSeconds);
        break;
      default:
        sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }
    return sorted;
  }, [items, search, privacyFilter, formatFilter, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos by title..."
            className="pl-8"
          />
        </div>
        <Select value={privacyFilter} onValueChange={(v) => setPrivacyFilter((v ?? "all") as VideoPrivacyFilter)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by privacy">
            <SelectValue>
              {(v: string | null) => VIDEO_PRIVACY_FILTER_LABELS[(v ?? "all") as VideoPrivacyFilter]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VIDEO_PRIVACY_FILTER_LABELS) as VideoPrivacyFilter[]).map((key) => (
              <SelectItem key={key} value={key}>
                {VIDEO_PRIVACY_FILTER_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={(v) => setFormatFilter((v ?? "all") as VideoFormatFilter)}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Filter by format">
            <SelectValue>
              {(v: string | null) => VIDEO_FORMAT_FILTER_LABELS[(v ?? "all") as VideoFormatFilter]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VIDEO_FORMAT_FILTER_LABELS) as VideoFormatFilter[]).map((key) => (
              <SelectItem key={key} value={key}>
                {VIDEO_FORMAT_FILTER_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? "newest") as VideoSort)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort videos">
            <SelectValue>{(v: string | null) => VIDEO_SORT_LABELS[(v ?? "newest") as VideoSort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VIDEO_SORT_LABELS) as VideoSort[]).map((key) => (
              <SelectItem key={key} value={key}>
                {VIDEO_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={refreshFromStart}
          disabled={refreshing}
          aria-label="Refresh videos"
        >
          <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
        </Button>
        {canManage && <UploadVideoDialog organizationId={organizationId} onUploaded={refreshFromStart} />}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No videos yet.</CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No videos match your search or filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((video) => (
            <VideoCard
              key={video.id}
              organizationId={organizationId}
              video={video}
              canManage={canManage}
              onUpdated={handleVideoUpdated}
              onDeleted={handleVideoDeleted}
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
// Analytics
// ---------------------------------------------------------------------------

function TopVideoRow({ video, rank }: { video: YouTubeTopVideo; rank: number }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.id}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {rank}
      </span>
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt={video.title} className="h-10 w-16 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-10 w-16 shrink-0 rounded bg-accent" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{video.title}</p>
        <p className="text-xs text-muted-foreground">
          {video.views.toLocaleString()} views · {video.likes.toLocaleString()} likes ·{" "}
          {video.comments.toLocaleString()} comments
        </p>
      </div>
    </a>
  );
}

function YouTubeAnalyticsTab({
  channel,
  analytics,
  topVideos,
}: {
  channel: YouTubeConnectionSummary;
  analytics: YouTubeAnalyticsValue[];
  topVideos: YouTubeTopVideo[];
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
    <div className="space-y-6">
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

      {topVideos.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 font-heading text-sm font-bold">
            <Trophy className="size-4 text-muted-foreground" />
            Top videos (last 28 days)
          </h3>
          <Card>
            <CardContent className="flex flex-col gap-1">
              {topVideos.map((video, index) => (
                <TopVideoRow key={video.id} video={video} rank={index + 1} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
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

type CommentSort = "newest" | "oldest" | "most_liked";

const COMMENT_SORT_LABELS: Record<CommentSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  most_liked: "Most liked",
};

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
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CommentSort>("newest");

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreYouTubeComments(organizationId, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  // Comment threads already arrive newest-first from the API (order=time)
  // — sorting here only reorders what's loaded, same reasoning as videos.
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((comment) => {
      if (!query) return true;
      return comment.text.toLowerCase().includes(query) || comment.authorName.toLowerCase().includes(query);
    });

    const sorted = [...filtered];
    if (sortBy === "oldest") {
      sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    } else if (sortBy === "most_liked") {
      sorted.sort((a, b) => b.likeCount - a.likeCount);
    } else {
      sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }
    return sorted;
  }, [items, search, sortBy]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments by text or author..."
            className="pl-8"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? "newest") as CommentSort)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort comments">
            <SelectValue>{(v: string | null) => COMMENT_SORT_LABELS[(v ?? "newest") as CommentSort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(COMMENT_SORT_LABELS) as CommentSort[]).map((key) => (
              <SelectItem key={key} value={key}>
                {COMMENT_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No comments match your search.
          </CardContent>
        </Card>
      ) : (
        visibleItems.map((comment) => (
          <CommentCard key={comment.id} organizationId={organizationId} comment={comment} />
        ))
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
// Go live
//
// The dialog manages the broadcast's lifecycle (create, go live, end) and
// hands back a stream key — actual camera/mic capture and encoding happen
// in dedicated streaming software (OBS, Streamlabs, a phone app) pointed at
// that key, since browsers have no way to push RTMP directly.
// ---------------------------------------------------------------------------


function StreamKeyDisplay({ streamKey }: { streamKey: YouTubeStreamKey }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"server" | "key" | null>(null);

  function copy(value: string, which: "server" | "key") {
    navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1.5">
        <Label>Server URL</Label>
        <div className="flex items-center gap-2">
          <Input readOnly value={streamKey.ingestionAddress} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(streamKey.ingestionAddress, "server")}
          >
            {copied === "server" ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Stream key</Label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            type={revealed ? "text" : "password"}
            value={streamKey.streamName}
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" size="icon" onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => copy(streamKey.streamName, "key")}>
            {copied === "key" ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste these into OBS, Streamlabs, or your streaming app (usually under Stream → Custom), start streaming
        there, then click &quot;Go live&quot; below once your preview looks right.
      </p>
    </div>
  );
}

type LiveDialogView = "loading" | "form" | "setup" | "live";

// Google's raw message for this case is "The user is not enabled for live
// streaming." — a one-time, per-channel YouTube Studio setup step (phone
// verification + a ~24h waiting period on first enable), not something an
// API call can fix. Worth a direct link instead of the raw error text.
function isLiveStreamingNotEnabledError(message: string): boolean {
  return /not enabled for live streaming/i.test(message);
}

function GoLiveDialog({ organizationId, channelId }: { organizationId: string; channelId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<LiveDialogView>("loading");
  const [broadcast, setBroadcast] = useState<YouTubeManagedBroadcast | null>(null);
  const [streamKey, setStreamKey] = useState<YouTubeStreamKey | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<YouTubePrivacyStatus>("public");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function applyStatus(status: { broadcast: YouTubeManagedBroadcast | null; streamKey: YouTubeStreamKey | null }) {
    setBroadcast(status.broadcast);
    setStreamKey(status.streamKey);
    if (status.broadcast?.lifeCycleStatus === "live") {
      setView("live");
    } else if (status.broadcast) {
      setView("setup");
    } else {
      setView("form");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setTitle("");
      setDescription("");
      setPrivacy("public");
      setView("loading");
      getYouTubeLiveStatus(organizationId).then(applyStatus);
    }
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await startYouTubeBroadcast(organizationId, { title, description, privacyStatus: privacy });
      if (result.error || !result.broadcast || !result.streamKey) {
        setError(result.error ?? "Couldn't start the livestream.");
        return;
      }
      setError(undefined);
      setBroadcast(result.broadcast);
      setStreamKey(result.streamKey);
      setView("setup");
    });
  }

  function handleGoLive() {
    if (!broadcast) return;
    startTransition(async () => {
      const result = await goLiveYouTubeBroadcast(organizationId, broadcast.id);
      if (result.error || !result.broadcast) {
        setError(result.error ?? "Couldn't go live.");
        return;
      }
      setError(undefined);
      setBroadcast(result.broadcast);
      setView("live");
    });
  }

  function handleEnd() {
    if (!broadcast) return;
    startTransition(async () => {
      const result = await endYouTubeBroadcast(organizationId, broadcast.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleCancel() {
    if (!broadcast) return;
    startTransition(async () => {
      const result = await cancelYouTubeBroadcast(organizationId, broadcast.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBroadcast(null);
      setStreamKey(null);
      setView("form");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button">
            <Video className="size-4" />
            Go live
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{view === "live" ? "You're live" : "Start a livestream"}</DialogTitle>
          <DialogDescription>
            {view === "form" &&
              "Create a broadcast, then point your streaming software at the stream key it gives you."}
            {view === "setup" &&
              'Start streaming with the details below, then click "Go live" once your preview looks good.'}
            {view === "live" && "Your stream is publicly visible on YouTube right now."}
            {view === "loading" && "Checking for an existing stream..."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {isLiveStreamingNotEnabledError(error) ? (
                <>
                  This channel hasn&apos;t been enabled for live streaming yet. Open{" "}
                  <a
                    href={`https://studio.youtube.com/channel/${channelId}/editing/features`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    YouTube Studio → Settings → Channel → Feature eligibility
                  </a>{" "}
                  to verify your phone number and enable it. There&apos;s usually a ~24 hour wait after first
                  enabling before you can actually go live.
                </>
              ) : (
                error
              )}
            </AlertDescription>
          </Alert>
        )}

        {view === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="live-title">Title</Label>
              <Input
                id="live-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sunday Morning Service"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="live-description">Description (optional)</Label>
              <Textarea
                id="live-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="live-privacy">Privacy</Label>
              <Select value={privacy} onValueChange={(v) => setPrivacy((v ?? "public") as YouTubePrivacyStatus)}>
                <SelectTrigger id="live-privacy" className="w-full">
                  <SelectValue>
                    {(v: string | null) => PRIVACY_LABELS[(v ?? "public") as YouTubePrivacyStatus]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIVACY_LABELS) as YouTubePrivacyStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PRIVACY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleCreate} disabled={pending || !title.trim()}>
                {pending ? "Creating..." : "Create broadcast"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {view === "setup" && streamKey && (
          <div className="space-y-4">
            <StreamKeyDisplay streamKey={streamKey} />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={pending}>
                Cancel broadcast
              </Button>
              <Button type="button" onClick={handleGoLive} disabled={pending}>
                {pending ? "Going live..." : "Go live"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {view === "live" && broadcast && (
          <div className="space-y-4">
            <Badge variant="destructive">
              <Radio className="size-3" />
              Live now
            </Badge>
            <a
              href={`https://www.youtube.com/watch?v=${broadcast.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Watch on YouTube
              <ExternalLink className="size-3.5" />
            </a>
            <DialogFooter>
              <Button type="button" variant="destructive" onClick={handleEnd} disabled={pending}>
                {pending ? "Ending..." : "End stream"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

      {canManage && (
        <div className="flex justify-end">
          <GoLiveDialog organizationId={organizationId} channelId={data.channel.channelId} />
        </div>
      )}

      <YouTubeLiveBanner liveBroadcasts={data.liveBroadcasts} />

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="videos">Videos</TabsTab>
          <TabsTab value="analytics">Analytics</TabsTab>
          <TabsTab value="comments">Comments</TabsTab>
        </TabsList>
        <TabsPanel value="videos">
          <YouTubeVideosTab organizationId={organizationId} canManage={canManage} initialVideos={data.videos} />
        </TabsPanel>
        <TabsPanel value="analytics">
          <YouTubeAnalyticsTab channel={data.channel} analytics={data.analytics} topVideos={data.topVideos} />
        </TabsPanel>
        <TabsPanel value="comments">
          <YouTubeCommentsTab organizationId={organizationId} initialComments={data.comments} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
