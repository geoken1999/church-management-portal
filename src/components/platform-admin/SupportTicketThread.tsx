"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { addPlatformSupportReply, type AddPlatformSupportReplyState } from "@/lib/platform-admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SupportTicketMessageRow } from "@/lib/platform-admin/dal";

const initialState: AddPlatformSupportReplyState = {};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SupportTicketThread({ ticketId, messages }: { ticketId: string; messages: SupportTicketMessageRow[] }) {
  const router = useRouter();
  const [state, setState] = useState<AddPlatformSupportReplyState>(initialState);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await addPlatformSupportReply(state, formData);
      setState(result);
      if (result.success) {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((message) => (
            <div key={message.id} className={`rounded-lg p-3 text-sm ${message.authorType === "admin" ? "bg-primary/10" : "bg-muted/40"}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{message.authorName ?? "Someone"}</span>
                <span>{formatDateTime(message.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          ))}
        </div>
      )}

      <form action={handleSubmit} className="space-y-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to this church..." rows={2} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {pending ? "Sending..." : "Reply"}
            {!pending && <Send className="size-3.5" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
