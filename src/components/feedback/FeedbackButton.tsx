"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import { hasGivenFeedbackAction, submitWebFeedback } from "@/lib/feedback/actions";
import { FEEDBACK_CATEGORIES, FEEDBACK_LABELS, MAX_FEEDBACK_MESSAGE, type FeedbackCategory } from "@/lib/feedback/validation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StarRating } from "./StarRating";

// Until feedback has been sent, the dialog opens by itself now and then: the first time after a few minutes of use,
// then again after a random number of days each time it is closed without sending. Kept per browser.
const NEXT_KEY = "kf-feedback-next";
const DONE_KEY = "kf-feedback-done";
const MINUTE = 60_000;
const DAY = 86_400_000;
const between = (min: number, max: number) => min + Math.random() * (max - min);

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the reminder simply doesn't repeat.
  }
}

// The header's "Send feedback": a star rating, what kind of feedback it is, and a few words.
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (readStore(DONE_KEY)) return;
    const stored = Number(readStore(NEXT_KEY));
    const due = stored > 0 ? stored : Date.now() + between(3 * MINUTE, 10 * MINUTE);
    if (!(stored > 0)) writeStore(NEXT_KEY, String(due));
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        const given = await hasGivenFeedbackAction().catch(() => false);
        if (cancelled) return;
        if (given) writeStore(DONE_KEY, "1");
        else setOpen(true);
      },
      Math.min(Math.max(due - Date.now(), 0), 2_000_000_000),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  function close(next: boolean) {
    setOpen(next);
    if (!next) writeStore(sent ? DONE_KEY : NEXT_KEY, sent ? "1" : String(Date.now() + between(1 * DAY, 4 * DAY)));
    if (!next && sent) {
      setSent(false);
      setRating(0);
      setMessage("");
    }
    if (!next) setError(null);
  }

  function send() {
    if (rating === 0) {
      setError("Please choose a rating first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitWebFeedback({ rating, category, message, screen: pathname });
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon" title="Send feedback" aria-label="Send feedback" onClick={() => setOpen(true)} className="print:hidden">
        <MessageSquareHeart className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          {sent ? (
            <>
              <DialogHeader>
                <DialogTitle>Thank you!</DialogTitle>
                <DialogDescription>Your feedback has reached the KingdomFlow team. It helps us make the app better for your church.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => close(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Send feedback</DialogTitle>
                <DialogDescription>How is KingdomFlow working for you? Tell us what you like, what you wish it did, or what&apos;s not working.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Your rating</Label>
                  <StarRating value={rating} onChange={setRating} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="feedback-category">This is</Label>
                  <select
                    id="feedback-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {FEEDBACK_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="feedback-message">Your message</Label>
                  <Textarea id="feedback-message" rows={5} maxLength={MAX_FEEDBACK_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us more (optional)" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => close(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={send} disabled={pending}>
                  {pending ? "Sending..." : "Send feedback"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
