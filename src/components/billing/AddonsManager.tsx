"use client";

import { useState } from "react";
import { MessageSquareText, Mail, MessageCircle, HardDrive, Sparkles } from "lucide-react";
import { createAddonOrder } from "@/lib/billing/addon-actions";
import type { PayUFormFields } from "@/lib/payu/client";
import { ADDON_TYPE_LABELS, addonPacksFor, type AddonType, type AddonPack } from "@/lib/plans/config";
import { formatBytes } from "@/lib/plans/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ADDON_ICONS: Record<AddonType, typeof MessageSquareText> = {
  sms: MessageSquareText,
  email: Mail,
  whatsapp: MessageCircle,
  storage: HardDrive,
  ai: Sparkles,
};

function formatBalance(addonType: AddonType, value: number): string {
  return addonType === "storage" ? formatBytes(value) : value.toLocaleString();
}

// PayU has no JS checkout SDK to open in place — paying means the whole
// page navigates to PayU's hosted checkout, then PayU redirects back to
// /api/payu/addon/return once done. This builds that one-time form in the
// DOM and submits it, rather than keeping it in React state, since nothing
// about it needs to react to further renders — it exists only to trigger
// one navigation.
function redirectToPayU(actionUrl: string, fields: PayUFormFields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function PackCard({ pack, payuConfigured }: { pack: AddonPack; payuConfigured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);
    setPending(true);

    const result = await createAddonOrder(pack.id);
    if (result.error || !result.payuFields || !result.payuActionUrl) {
      setError(result.error ?? "Couldn't start the payment.");
      setPending(false);
      return;
    }

    // The page is about to navigate away to PayU, so there's no "pending"
    // state to clear on success — only on the error paths above.
    redirectToPayU(result.payuActionUrl, result.payuFields);
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{pack.label}</p>
            <p className="text-xs text-muted-foreground">₹{pack.priceInRupees.toLocaleString("en-IN")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={pending || !payuConfigured} onClick={handleBuy}>
            {pending ? "Redirecting..." : "Buy"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function AddonsManager({
  payuConfigured,
  balances,
}: {
  payuConfigured: boolean;
  balances: Record<AddonType, number>;
}) {
  const types: AddonType[] = ["sms", "email", "whatsapp", "storage", "ai"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add-on packs</CardTitle>
        <CardDescription>
          Running low before your next billing cycle? Top up SMS, Email, WhatsApp, storage, or AI credits without changing your plan — credits carry over and never expire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!payuConfigured && (
          <Alert variant="destructive">
            <AlertDescription>Payments aren&apos;t configured yet — add-on packs aren&apos;t available until PayU is set up.</AlertDescription>
          </Alert>
        )}
        {types.map((type) => {
          const Icon = ADDON_ICONS[type];
          return (
            <div key={type} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="size-4 text-primary" />
                <h3 className="font-heading text-sm font-bold">{ADDON_TYPE_LABELS[type]}</h3>
                <span className="text-xs text-muted-foreground">
                  {formatBalance(type, balances[type])} {type === "storage" ? "extra" : "extra credits"} available
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {addonPacksFor(type).map((pack) => (
                  <PackCard key={pack.id} pack={pack} payuConfigured={payuConfigured} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
