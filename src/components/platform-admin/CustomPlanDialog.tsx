"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import {
  setTenantCustomPlanLimits,
  clearTenantCustomPlanLimits,
  type SetTenantCustomPlanLimitsState,
} from "@/lib/platform-admin/actions";
import {
  CAPPABLE_TABS,
  FINANCE_TABS,
  SOCIAL_TABS,
  type PlanLimits,
  type CustomPlanOverrides,
} from "@/lib/plans/config";
import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
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

type SwitchValue = "default" | "on" | "off";

function switchValue(value: boolean | undefined): SwitchValue {
  return value === undefined ? "default" : value ? "on" : "off";
}

// Tabs shown as one row each, after the two group switches cover the rest.
const INDIVIDUAL_TABS = TAB_KEYS.filter((tab) => !FINANCE_TABS.includes(tab) && !SOCIAL_TABS.includes(tab));

function SwitchSelect({ name, defaultValue }: { name: string; defaultValue: SwitchValue }) {
  return (
    <select id={name} name={name} defaultValue={defaultValue} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
      <option value="default">Plan default</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  );
}

export function CustomPlanDialog({
  organizationId,
  effectiveLimits,
  customPlanLimits,
  hasCustomPlan,
}: {
  organizationId: string;
  effectiveLimits: PlanLimits;
  customPlanLimits: CustomPlanOverrides | null;
  hasCustomPlan: boolean;
}) {
  const tabOverrides = customPlanLimits?.tabOverrides ?? {};
  const featureCaps = customPlanLimits?.featureCaps ?? {};
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="ownPaymentGatewayEnabled" defaultChecked={overrides.ownPaymentGatewayEnabled} />
              Own payment gateway
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="customSmtpEnabled" defaultChecked={overrides.customSmtpEnabled} />
              Own SMTP
            </label>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Features</p>
              <p className="text-xs text-muted-foreground">
                Force each module on or off for this church, regardless of plan. &quot;Plan default&quot; follows the
                plan. The platform-wide switch on Feature Flags still overrides everything.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="group_finance">Finance (Fund Raiser, Offering, Donation, Accounting)</Label>
                <SwitchSelect name="group_finance" defaultValue={switchValue(tabOverrides.fundraisers)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="group_social">Social Media (Instagram, YouTube, Facebook)</Label>
                <SwitchSelect name="group_social" defaultValue={switchValue(tabOverrides.instagram)} />
              </div>
              {INDIVIDUAL_TABS.map((tab: TabKey) => (
                <div key={tab} className="space-y-1">
                  <Label htmlFor={`tab_${tab}`}>{TAB_LABELS[tab]}</Label>
                  <SwitchSelect name={`tab_${tab}`} defaultValue={switchValue(tabOverrides[tab])} />
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">Caps (max entries, blank = unlimited)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CAPPABLE_TABS.map((tab) => (
                  <div key={tab} className="space-y-1">
                    <Label htmlFor={`cap_${tab}`}>{TAB_LABELS[tab]}</Label>
                    <Input
                      id={`cap_${tab}`}
                      name={`cap_${tab}`}
                      type="number"
                      min={0}
                      defaultValue={nullableIntDefault(featureCaps[tab] ?? null)}
                    />
                  </div>
                ))}
              </div>
            </div>
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
