"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitCustomPlanRequest, type CustomPlanRequestState } from "@/lib/custom-plan/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: CustomPlanRequestState = {};

export function CustomPlanRequestDialog({ triggerLabel, triggerClassName }: { triggerLabel: string; triggerClassName?: string }) {
  const [state, formAction, pending] = useActionState(submitCustomPlanRequest, initialState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" className={triggerClassName}>{triggerLabel}</Button>} />
      <DialogContent>
        {state.success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-9 text-primary" />
            <div>
              <p className="font-heading text-lg font-bold">Request sent</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Thanks for reaching out — our team will contact you directly to discuss a custom plan.
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request a Custom plan</DialogTitle>
              <DialogDescription>
                Tell us a bit about your church and we&apos;ll get in touch to work out a plan that fits.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              {state.error && (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="custom-plan-church">Church name</Label>
                <Input
                  id="custom-plan-church"
                  name="churchName"
                  aria-invalid={Boolean(state.fieldErrors?.churchName)}
                  aria-describedby={state.fieldErrors?.churchName ? "custom-plan-church-error" : undefined}
                />
                <FieldError id="custom-plan-church-error" message={state.fieldErrors?.churchName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-plan-email">Email</Label>
                <Input
                  id="custom-plan-email"
                  name="email"
                  type="email"
                  aria-invalid={Boolean(state.fieldErrors?.email)}
                  aria-describedby={state.fieldErrors?.email ? "custom-plan-email-error" : undefined}
                />
                <FieldError id="custom-plan-email-error" message={state.fieldErrors?.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-plan-phone">Phone</Label>
                <Input
                  id="custom-plan-phone"
                  name="phone"
                  type="tel"
                  aria-invalid={Boolean(state.fieldErrors?.phone)}
                  aria-describedby={state.fieldErrors?.phone ? "custom-plan-phone-error" : undefined}
                />
                <FieldError id="custom-plan-phone-error" message={state.fieldErrors?.phone} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending} className="w-full sm:w-auto">
                  {pending ? "Sending..." : (
                    <>
                      Submit request
                      <Send className="size-4" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
