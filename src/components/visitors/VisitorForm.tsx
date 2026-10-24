"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitVisit, type VisitFormState } from "@/lib/visitors/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: VisitFormState = {};

export function VisitorForm({ slug, churchName }: { slug: string; churchName: string }) {
  const [state, action, pending] = useActionState(submitVisit.bind(null, slug), initial);

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <h2 className="font-heading text-xl font-bold">
          {state.done === "member" ? "You're already part of us!" : state.done === "returning" ? "Welcome back!" : "Welcome, we're so glad you came!"}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {state.done === "member"
            ? `Your number is already in ${churchName}'s family. No need to sign in again here.`
            : state.done === "returning"
              ? `Thank you for visiting ${churchName} again. We're glad to see you.`
              : `Thank you for visiting ${churchName}. We'll send you a short message tomorrow to hear how your visit went.`}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && !state.fieldErrors && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="visit-name">Your name</Label>
        <Input id="visit-name" name="name" autoComplete="name" required />
        {state.fieldErrors?.name && <p className="text-sm text-destructive">{state.fieldErrors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visit-phone">Mobile number</Label>
        <Input id="visit-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="With WhatsApp, if you can" required />
        {state.fieldErrors?.phone && <p className="text-sm text-destructive">{state.fieldErrors.phone}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visit-email">Email (optional)</Label>
        <Input id="visit-email" name="email" type="email" inputMode="email" autoComplete="email" />
        {state.fieldErrors?.email && <p className="text-sm text-destructive">{state.fieldErrors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visit-prayer">Prayer request (optional)</Label>
        <Textarea id="visit-prayer" name="prayerRequest" rows={4} placeholder="Is there something we can pray with you about?" />
        {state.fieldErrors?.prayerRequest && <p className="text-sm text-destructive">{state.fieldErrors.prayerRequest}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "I'm visiting today"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Only the church&apos;s leaders see this. We&apos;ll WhatsApp you once tomorrow to hear how your visit went.</p>
    </form>
  );
}
