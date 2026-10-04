"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import {
  setTenantCustomPlanLimits,
  clearTenantCustomPlanLimits,
  type SetTenantCustomPlanLimitsState,
} from "@/lib/platform-admin/actions";
import type { PlanLimits, CustomPlanOverrides } from "@/lib/plans/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: SetTenantCustomPlanLimitsState = {};

// Blank means "unlimited" (null) — matches readNullableInt on the action
// side (src/lib/platform-admin/actions.ts).
function nullableIntDefault(value: number | null): string {
  return value === null ? "" : String(value);
}

export function CustomPlanDialog({
  organizationId,
  effectiveLimits,
  hasCustomPlan,
}: {
  organizationId: string;
  effectiveLimits: PlanLimits;
  hasCustomPlan: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<SetTenantCustomPlanLimitsState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await setTenantCustomPlanLimits(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function handleClear() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      await clearTenantCustomPlanLimits(formData);
      setOpen(false);
      router.refresh();
    });
  }

  const overrides: CustomPlanOverrides = effectiveLimits;
  const storageGb = effectiveLimits.storageBytes / (1024 * 1024 * 1024);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(initialState);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Settings2 className="size-3.5" />
            Custom rules
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom plan rules</DialogTitle>
          <DialogDescription>
            Overrides this org&apos;s plan rules directly — fulfillment for a negotiated Custom deal. Pricing stays
            whatever this org is comped to via &quot;Set plan&quot;; only the rules below change. Prefilled from{" "}
            {hasCustomPlan ? "the current custom rules" : "the org's current plan"}.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed on the effective limits so reopening after a save (which
            refreshes the parent's server data) remounts with freshly
            prefilled defaultValues, instead of the stale uncontrolled
            ones from before the save. */}
        <form key={JSON.stringify(overrides)} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="emailsPerMonth">Emails/month</Label>
              <Input id="emailsPerMonth" name="emailsPerMonth" type="number" min={0} defaultValue={overrides.emailsPerMonth} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smsPerMonth">SMS/month</Label>
              <Input id="smsPerMonth" name="smsPerMonth" type="number" min={0} defaultValue={overrides.smsPerMonth} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappPerMonth">WhatsApp/month</Label>
              <Input id="whatsappPerMonth" name="whatsappPerMonth" type="number" min={0} defaultValue={overrides.whatsappPerMonth} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aiRepliesPerMonth">AI credits/month</Label>
              <Input id="aiRepliesPerMonth" name="aiRepliesPerMonth" type="number" min={0} defaultValue={overrides.aiRepliesPerMonth} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storageGb">Storage (GB)</Label>
              <Input id="storageGb" name="storageGb" type="number" min={0} step="0.1" defaultValue={storageGb} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supportSlaDays">Support SLA (days)</Label>
              <Input id="supportSlaDays" name="supportSlaDays" type="number" min={0} defaultValue={overrides.supportSlaDays} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="kmeetMaxDurationMinutes">K-meet max (min, blank = unlimited)</Label>
              <Input id="kmeetMaxDurationMinutes" name="kmeetMaxDurationMinutes" type="number" min={0} defaultValue={nullableIntDefault(overrides.kmeetMaxDurationMinutes)} />
              <p className="text-xs text-muted-foreground">K-audio is always this + 10 min.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branchLimit">Branches (blank = unlimited)</Label>
              <Input id="branchLimit" name="branchLimit" type="number" min={0} defaultValue={nullableIntDefault(overrides.branchLimit)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memberLimit">Members (blank = unlimited)</Label>
              <Input id="memberLimit" name="memberLimit" type="number" min={0} defaultValue={nullableIntDefault(overrides.memberLimit)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="formsLimit">Forms (blank = unlimited)</Label>
              <Input id="formsLimit" name="formsLimit" type="number" min={0} defaultValue={nullableIntDefault(overrides.formsLimit)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxAdditionalAdmins">Added admin seats</Label>
              <Input id="maxAdditionalAdmins" name="maxAdditionalAdmins" type="number" min={0} defaultValue={overrides.maxAdditionalAdmins} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxAdditionalStaff">Added staff seats</Label>
              <Input id="maxAdditionalStaff" name="maxAdditionalStaff" type="number" min={0} defaultValue={overrides.maxAdditionalStaff} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instagramAccountLimit">Instagram accounts</Label>
              <Input id="instagramAccountLimit" name="instagramAccountLimit" type="number" min={0} defaultValue={overrides.instagramAccountLimit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="youtubeAccountLimit">YouTube accounts</Label>
              <Input id="youtubeAccountLimit" name="youtubeAccountLimit" type="number" min={0} defaultValue={overrides.youtubeAccountLimit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="automationLimit">Automations (blank = unlimited)</Label>
              <Input id="automationLimit" name="automationLimit" type="number" min={0} defaultValue={nullableIntDefault(overrides.automationLimit)} />
              <p className="text-xs text-muted-foreground">0 disables Automation entirely.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="financeEnabled" defaultChecked={overrides.financeEnabled} />
              Finance
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="ownPaymentGatewayEnabled" defaultChecked={overrides.ownPaymentGatewayEnabled} />
              Own gateway
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="customSmtpEnabled" defaultChecked={overrides.customSmtpEnabled} />
              Own SMTP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="socialMediaEnabled" defaultChecked={overrides.socialMediaEnabled} />
              Social Media
            </label>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {hasCustomPlan ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={handleClear}>
                Revert to standard plan
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save custom rules"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
