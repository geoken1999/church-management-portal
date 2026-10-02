"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, UserRound } from "lucide-react";
import { sendAuraMessage } from "@/lib/aura/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface AuraChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How many people attended last Sunday's service?",
  "How many active members do we have?",
  "What events are coming up this month?",
  "How much have we raised across active fundraisers?",
];

export function AuraChat({
  initialMessages,
  aiRepliesRemaining,
  canWrite,
}: {
  initialMessages: AuraChatMessage[];
  aiRepliesRemaining: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<AuraChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const nextLocalId = useRef(0);

  const outOfCredits = aiRepliesRemaining <= 0;
  const disabled = !canWrite || pending || outOfCredits;

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    setError(null);
    nextLocalId.current += 1;
    const optimisticId = `pending-${nextLocalId.current}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: trimmed }]);
    setInput("");
    scrollToBottom();

    startTransition(async () => {
      const result = await sendAuraMessage(trimmed);
      if (result.error) {
        setError(result.error);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        return;
      }
      setMessages((prev) => [...prev, { id: `${optimisticId}-reply`, role: "assistant", content: result.reply ?? "" }]);
      scrollToBottom();
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-1 min-h-0 flex-col">
      <CardContent className="flex flex-1 min-h-0 flex-col gap-4">
        <div ref={listRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto scrollbar-hide pr-1">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <p className="font-heading font-semibold">Ask Aura anything about your organization</p>
                <p className="text-sm text-muted-foreground">Try one of these, or type your own question below.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button key={suggestion} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => handleSend(suggestion)}>
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex items-start gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${message.role === "user" ? "bg-muted" : "bg-primary/10"}`}>
                {message.role === "user" ? <UserRound className="size-4 text-muted-foreground" /> : <Sparkles className="size-4 text-primary" />}
              </div>
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-4 text-primary" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!canWrite && <p className="text-sm text-muted-foreground">You don&apos;t have permission to chat with Aura — ask an admin to update your access.</p>}

        {canWrite && outOfCredits && (
          <p className="text-sm text-muted-foreground">
            You&apos;re out of AI credits for this month. Buy an add-on pack or upgrade your plan from Billing to keep chatting with Aura.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="Ask Aura a question about your organization..."
            disabled={disabled}
            rows={1}
            className="min-h-10 resize-none"
          />
          <Button type="submit" size="icon" disabled={disabled || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
        {!outOfCredits && canWrite && (
          <p className="text-right text-xs text-muted-foreground">{aiRepliesRemaining.toLocaleString()} AI credits remaining</p>
        )}
      </CardContent>
    </Card>
  );
}
