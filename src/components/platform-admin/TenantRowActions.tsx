"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Clock } from "lucide-react";
import { setTenantPlan, extendTenantTrial, type SetTenantPlanState, type ExtendTenantTrialState } from "@/lib/platform-admin/actions";
import { PLANS, type PlanId } from "@/lib/plans/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const planInitialState: SetTenantPlanState = {};
const trialInitialState: ExtendTenantTrialState = {};

function SetPlanDialog({ organizationId, currentPlan }: { organizationId: string; currentPlan: PlanId }) {
  const router = useRouter();
  const [state, setState] = useState<SetTenantPlanState>(planInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<PlanId>(currentPlan);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await setTenantPlan(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(planInitialState);
          setPlanId(currentPlan);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Pencil className="size-3.5" />
            Set plan
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set plan</DialogTitle>
          <DialogDescription>
            Grants this plan for free — no Razorpay subscription is created. Use this to comp a church or fix a billing
            mismatch.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="planId" value={planId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={planId} onValueChange={(v) => setPlanId((v ?? "basic") as PlanId)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => (v && v in PLANS ? PLANS[v as PlanId].name : "Select a plan")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PLANS) as PlanId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {PLANS[id].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Set plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtendTrialDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ExtendTenantTrialState>(trialInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await extendTenantTrial(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(trialInitialState);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Clock className="size-3.5" />
            Extend trial
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend trial</DialogTitle>
          <DialogDescription>Adds days on top of today or their current trial end, whichever is later.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="days">Days</Label>
            <Input id="days" name="days" type="number" min={1} defaultValue={14} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Extending..." : "Extend trial"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TenantRowActions({ organizationId, currentPlan }: { organizationId: string; currentPlan: PlanId }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ExtendTrialDialog organizationId={organizationId} />
      <SetPlanDialog organizationId={organizationId} currentPlan={currentPlan} />
    </div>
  );
}
