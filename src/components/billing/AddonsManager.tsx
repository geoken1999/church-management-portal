"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Mail, MessageCircle, HardDrive } from "lucide-react";
import { createAddonOrder, confirmAddonPayment } from "@/lib/billing/addon-actions";
import { ADDON_TYPE_LABELS, addonPacksFor, type AddonType, type AddonPack } from "@/lib/plans/config";
import { formatBytes } from "@/lib/plans/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Couldn't load Razorpay checkout.")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

const ADDON_ICONS: Record<AddonType, typeof MessageSquareText> = {
  sms: MessageSquareText,
  email: Mail,
  whatsapp: MessageCircle,
  storage: HardDrive,
};

function formatBalance(addonType: AddonType, value: number): string {
  return addonType === "storage" ? formatBytes(value) : value.toLocaleString();
}

function PackCard({
  pack,
  prefill,
  razorpayConfigured,
}: {
  pack: AddonPack;
  prefill: { name: string; email: string; contact: string };
  razorpayConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);
    setPending(true);

    const result = await createAddonOrder(pack.id);
    if (result.error || !result.orderId || !result.keyId) {
      setError(result.error ?? "Couldn't start the payment.");
      setPending(false);
      return;
    }

    if (!window.Razorpay) {
      setError("Checkout hasn't finished loading yet — try again in a moment.");
      setPending(false);
      return;
    }

    const razorpay = new window.Razorpay({
      key: result.keyId,
      order_id: result.orderId,
      amount: Math.round((result.amount ?? 0) * 100),
      currency: "INR",
      name: "KingdomFlow",
      description: result.packLabel ?? pack.label,
      prefill: { name: prefill.name, email: prefill.email || undefined, contact: prefill.contact || undefined },
      theme: { color: "#6C47FF" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const confirmResult = await confirmAddonPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
        setPending(false);
        if (confirmResult.error) {
          setError(confirmResult.error);
          return;
        }
        router.refresh();
      },
      modal: {
        ondismiss: () => setPending(false),
      },
    });
    razorpay.open();
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{pack.label}</p>
            <p className="text-xs text-muted-foreground">₹{pack.priceInRupees.toLocaleString("en-IN")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={pending || !razorpayConfigured} onClick={handleBuy}>
            {pending ? "Processing..." : "Buy"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function AddonsManager({
  razorpayConfigured,
  prefill,
  balances,
}: {
  razorpayConfigured: boolean;
  prefill: { name: string; email: string; contact: string };
  balances: Record<AddonType, number>;
}) {
  useEffect(() => {
    if (razorpayConfigured) {
      loadCheckoutScript().catch(() => {});
    }
  }, [razorpayConfigured]);

  const types: AddonType[] = ["sms", "email", "whatsapp", "storage"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add-on packs</CardTitle>
        <CardDescription>
          Running low before your next billing cycle? Top up SMS, Email, WhatsApp, or storage without changing your plan — credits carry over and never expire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!razorpayConfigured && (
          <Alert variant="destructive">
            <AlertDescription>Payments aren&apos;t configured yet — add-on packs aren&apos;t available until Razorpay is set up.</AlertDescription>
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
                  <PackCard key={pack.id} pack={pack} prefill={prefill} razorpayConfigured={razorpayConfigured} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
