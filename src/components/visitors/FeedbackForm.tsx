"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { submitFeedback, type FeedbackFormState } from "@/lib/visitors/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FeedbackFormState = {};

export function FeedbackForm({ token, firstName, churchName, alreadyAnswered }: { token: string; firstName: string; churchName: string; alreadyAnswered: boolean }) {
  const [state, action, pending] = useActionState(submitFeedback.bind(null, token), initial);
  const [rating, setRating] = useState(0);

  if (state.done || alreadyAnswered) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <h2 className="font-heading text-xl font-bold">Thank you{firstName ? `, ${firstName}` : ""}!</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Your feedback has reached {churchName}. God bless you.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      <div className="space-y-2">
        <Label>How was your visit?</Label>
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)} className="rounded-md p-1">
              <Star className={`size-9 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fb-text">Anything you&apos;d like to tell us? (optional)</Label>
        <Textarea id="fb-text" name="text" rows={4} placeholder="What did you enjoy? What could be better?" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Would you like someone from the church to follow up with you?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="followup" value="yes" required /> Yes, please get in touch
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="followup" value="no" /> No, thank you
        </label>
      </fieldset>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
