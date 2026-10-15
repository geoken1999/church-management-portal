"use client";

import { useState, useTransition } from "react";
import { saveUpdateConfigAction } from "@/lib/mobile/update-actions";
import type { PlatformUpdate, UpdateConfig } from "@/lib/mobile/update-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

const NAMES = { android: "Android", ios: "iPhone (iOS)" } as const;

export function MobileUpdatePanel({ initial }: { initial: UpdateConfig }) {
  const [config, setConfig] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (platform: "android" | "ios", key: keyof PlatformUpdate, value: string) => {
    setSaved(false);
    setConfig((c) => ({ ...c, [platform]: { ...c[platform], [key]: value } }));
  };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveUpdateConfigAction(config);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <ErrorToast message={error} />
      <CardHeader>
        <CardTitle>App updates</CardTitle>
        <CardDescription>
          Set this after a new build is live in the store. Apps older than the latest version are offered the update; apps older than the minimum must
          update before they can keep using the app. Leave the latest version blank to turn prompts off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {(["android", "ios"] as const).map((platform) => (
            <div key={platform} className="space-y-3">
              <p className="font-medium">{NAMES[platform]}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Latest version</Label>
                  <Input value={config[platform].latest} onChange={(e) => set(platform, "latest", e.target.value)} placeholder="1.1.1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Minimum version (forced)</Label>
                  <Input value={config[platform].minimum} onChange={(e) => set(platform, "minimum", e.target.value)} placeholder="optional" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Store link</Label>
                <Input value={config[platform].storeUrl} onChange={(e) => set(platform, "storeUrl", e.target.value)} placeholder="https://play.google.com/store/apps/details?id=…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">What&apos;s new (optional)</Label>
                <Textarea rows={3} maxLength={500} value={config[platform].notes} onChange={(e) => set(platform, "notes", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save update settings"}
          </Button>
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
