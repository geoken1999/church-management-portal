"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTicketCommentAction } from "@/lib/tickets/actions";
import type { ChangeTicketComment } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

export function TicketComments({
  ticketId,
  comments,
}: {
  ticketId: string;
  comments: ChangeTicketComment[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addTicketCommentAction(ticketId, text).catch(() => ({
        error: "Something went wrong. Please try again.",
      }));
      if (result.error) setError(result.error);
      else {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">
            {c.author} · {new Date(c.created_at).toLocaleString()}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
        </div>
      ))}
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
        placeholder="Add a comment"
      />
      <Button
        type="button"
        size="sm"
        disabled={pending || !text.trim()}
        onClick={add}
      >
        Comment
      </Button>
    </div>
  );
}
