"use client";

import { useActionState } from "react";
import { saveMembershipFeeSettings, type SaveMembershipFeeSettingsState } from "@/lib/membership-fees/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { MembershipFeeSettings } from "@/types/database";

const initialState: SaveMembershipFeeSettingsState = {};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function MembershipFeeSettingsForm({ settings, canWrite }: { settings: MembershipFeeSettings | null; canWrite: boolean }) {
  const [state, formAction, pending] = useActionState(saveMembershipFeeSettings, initialState);
  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Settings saved. Changes apply from the next run.</AlertDescription>
        </Alert>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} disabled={!canWrite} />
        Collect monthly membership fees
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="membership-amount">Monthly amount (₹)</Label>
          <Input
            id="membership-amount"
            name="amount"
            type="number"
            min={1}
            step="0.01"
            inputMode="decimal"
            defaultValue={settings?.amount ?? ""}
            disabled={!canWrite}
          />
          {state.fieldErrors?.amount && <p className="text-sm text-destructive">{state.fieldErrors.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="membership-due-day">Requests go out on day</Label>
          <select id="membership-due-day" name="dueDay" className={SELECT_CLASS} defaultValue={settings?.due_day ?? 1} disabled={!canWrite}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {state.fieldErrors?.dueDay && <p className="text-sm text-destructive">{state.fieldErrors.dueDay}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="membership-reminder">Reminder after (days)</Label>
          <select
            id="membership-reminder"
            name="reminderAfterDays"
            className={SELECT_CLASS}
            defaultValue={settings?.reminder_after_days ?? 7}
            disabled={!canWrite}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {state.fieldErrors?.reminderAfterDays && <p className="text-sm text-destructive">{state.fieldErrors.reminderAfterDays}</p>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Each member gets one payment link by email on the chosen day, with one reminder later if they haven&apos;t paid. Members who join after
        that day are billed from the next month.
      </p>
      {canWrite && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      )}
    </form>
  );
}
