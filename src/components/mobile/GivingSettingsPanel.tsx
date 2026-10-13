"use client";

import { useState, useTransition } from "react";
import { saveGivingSettingsAction } from "@/lib/finance/giving-config-actions";
import { GIVING_TYPES, GIVING_TYPE_LABELS } from "@/lib/finance/giving-types";
import type { GivingConfig } from "@/lib/finance/giving-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

export function GivingSettingsPanel({ config }: { config: GivingConfig }) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [mode, setMode] = useState<string>(config.mode ?? "");
  const [types, setTypes] = useState<string[]>(config.types);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleType(type: string) {
    setTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveGivingSettingsAction(enabled, mode, types);
      if (result.error) setError(result.error);
      else setNotice("Giving settings saved.");
    });
  }

  const ownDisabled = !config.ownGatewayAvailable || !config.ownConnected;

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          {!config.financeAvailable && (
            <Alert variant="destructive">
              <AlertDescription>{config.financeMessage}</AlertDescription>
            </Alert>
          )}
          <ErrorToast message={error} />
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={enabled} disabled={!config.financeAvailable} onChange={(e) => setEnabled(e.target.checked)} />
            <span>
              <span className="block font-medium">Accept online giving</span>
              <span className="block text-sm text-muted-foreground">Members see &quot;Give online&quot; in their Profile in the app.</span>
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Payment gateway</p>
            <label className="flex items-start gap-3">
              <input type="radio" name="mode" className="mt-1" checked={mode === "shared"} onChange={() => setMode("shared")} />
              <span>
                <span className="block text-sm font-medium">KingdomFlow gateway</span>
                <span className="block text-sm text-muted-foreground">Gifts are collected by KingdomFlow and paid out to your church.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 ${ownDisabled ? "opacity-60" : ""}`}>
              <input type="radio" name="mode" className="mt-1" disabled={ownDisabled} checked={mode === "own"} onChange={() => setMode("own")} />
              <span>
                <span className="block text-sm font-medium">Your own payment gateway ({config.ownGatewayLabel})</span>
                <span className="block text-sm text-muted-foreground">
                  {!config.ownGatewayAvailable
                    ? config.ownGatewayMessage
                    : config.ownConnected
                      ? "Gifts go straight to your own account."
                      : `Connect your ${config.ownGatewayLabel} account below first.`}
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Kinds of gift</p>
            {GIVING_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
                {GIVING_TYPE_LABELS[type]}
              </label>
            ))}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>

          {config.enabled && config.link && (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Your giving page</p>
              <a href={config.link} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
                {config.link}
              </a>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
