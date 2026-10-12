"use client";

import { useState, useTransition } from "react";
import { Megaphone, Trash2 } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGroupPostAction(groupKey, title, body, linkUrl, pagePath);
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
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent">
            <Megaphone className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Announcement board: {GROUP_LABELS[groupKey]}</p>
            <p className="text-sm text-muted-foreground">
              Notes and links for everyone in this group. Members who use the mobile app see them under this group in their Space tab. {note}
            </p>
          </div>
        </div>

        {canWrite && (
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
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Sharing..." : "Share with the group"}
            </Button>
          </form>
        )}

        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements for this group yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{post.title}</p>
                  {post.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>}
                  {post.link_url && (
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
