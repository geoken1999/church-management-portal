"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import { submitWebFeedback } from "@/lib/feedback/actions";
import { FEEDBACK_CATEGORIES, FEEDBACK_LABELS, MAX_FEEDBACK_MESSAGE, type FeedbackCategory } from "@/lib/feedback/validation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StarRating } from "./StarRating";

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

  function close(next: boolean) {
    setOpen(next);
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
