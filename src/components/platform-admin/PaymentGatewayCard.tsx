"use client";

import { useState, useTransition } from "react";
import { saveGatewayPolicyAction } from "@/lib/platform-admin/gateway-actions";
import type { GatewayPolicy, PlatformGateway } from "@/lib/payments/gateway-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

const LABEL: Record<PlatformGateway, string> = { razorpay: "Razorpay", cashfree: "Cashfree" };

// Which of KingdomFlow's own gateways takes gifts, paid events, membership fees, course fees and add-on packs first,
// and whether the other takes over when the first can't create the payment.
export function PaymentGatewayCard({ policy, configured }: { policy: GatewayPolicy; configured: Record<PlatformGateway, boolean> }) {
  const [primary, setPrimary] = useState<PlatformGateway>(policy.primary);
  const [failover, setFailover] = useState(policy.failover);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const changed = primary !== policy.primary || failover !== policy.failover;

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await saveGatewayPolicyAction(primary, failover);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-heading text-lg font-bold">Payment gateway</h2>
          <p className="text-sm text-muted-foreground">
            For one-time payments through KingdomFlow&apos;s own account: gifts, paid events, membership fees, course fees and add-on packs. Plan subscriptions stay on Razorpay.
          </p>
        </div>
        <ErrorToast message={error} />
        <div className="space-y-2">
          <p className="text-sm font-medium">Takes payments first</p>
          <div className="flex flex-wrap gap-2">
            {(["razorpay", "cashfree"] as const).map((gateway) => (
              <Button key={gateway} type="button" size="sm" variant={primary === gateway ? "default" : "outline"} onClick={() => setPrimary(gateway)}>
                {LABEL[gateway]}
                {!configured[gateway] ? " (not set up)" : ""}
              </Button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={failover} onChange={(e) => setFailover(e.target.checked)} />
          <span>
            <span className="font-medium">Automatic failover.</span> If {LABEL[primary]} can&apos;t create a payment, try {LABEL[primary === "razorpay" ? "cashfree" : "razorpay"]} instead, so a giver is not left with an error.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || !changed}>
            {pending ? "Saving..." : "Save"}
          </Button>
          {saved && !changed && <span className="text-sm text-primary">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
