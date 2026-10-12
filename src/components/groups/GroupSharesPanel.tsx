"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Megaphone, Trash2 } from "lucide-react";
import { createGroupPostAction, deleteGroupPostAction } from "@/lib/groups/actions";
import { GROUP_LABELS, type GroupKey } from "@/lib/groups/shares";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface GroupPostView {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
}

// "Shared with members": notes and links for everyone in this group, shown to
// them in the mobile app's Space tab. (The worship and media teams also see
// their document libraries there, automatically.)
export function GroupSharesPanel({
  groupKey,
  posts,
  canWrite,
  canDelete,
  pagePath,
  note,
}: {
  groupKey: GroupKey;
  posts: GroupPostView[];
  canWrite: boolean;
  canDelete: boolean;
  pagePath: string;
  note?: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [notify, setNotify] = useState(true);
  const [open, setOpen] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  function togglePost(id: string) {
    setExpandedPosts((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGroupPostAction(groupKey, title, body, linkUrl, pagePath, notify);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setBody("");
      setLinkUrl("");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent">
            <Megaphone className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Announcement board: {GROUP_LABELS[groupKey]} <span className="text-sm font-normal text-muted-foreground">({posts.length})</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Notes and links for everyone in this group. Members who use the mobile app see them under this group in their Space tab. {note}
            </p>
          </div>
          <ChevronDown className={`mt-1 size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && canWrite && (
          <form onSubmit={handleShare} className="space-y-3 rounded-md border border-border p-3">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`share-title-${groupKey}`} className="text-xs">
                Title
              </Label>
              <Input id={`share-title-${groupKey}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Camp details" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`share-body-${groupKey}`} className="text-xs">
                Message
              </Label>
              <Textarea id={`share-body-${groupKey}`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`share-link-${groupKey}`} className="text-xs">
                Link (optional, https://…)
              </Label>
              <Input id={`share-link-${groupKey}`} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Send a push notification to the group
            </label>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Sharing..." : "Share with the group"}
            </Button>
          </form>
        )}

        {!open ? null : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements for this group yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <button type="button" onClick={() => togglePost(post.id)} aria-expanded={expandedPosts.has(post.id)} className="flex items-center gap-1 text-left text-sm font-medium">
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expandedPosts.has(post.id) ? "rotate-180" : ""}`} />
                    {post.title}
                  </button>
                  {expandedPosts.has(post.id) && post.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>}
                  {expandedPosts.has(post.id) && post.link_url && (
                    <a href={post.link_url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-primary hover:underline">
                      {post.link_url}
                    </a>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove "${post.title}" for the group?`)) startTransition(async () => void (await deleteGroupPostAction(post.id, pagePath)));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
