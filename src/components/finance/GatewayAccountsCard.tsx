"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { removeGatewayAccountAction, saveGatewayAccountAction, setOwnGatewayAction } from "@/lib/finance/gateway-actions";
import { GATEWAYS, GATEWAY_FIELDS, GATEWAY_LABELS, type Gateway } from "@/lib/payments/gateways";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";

// Connect the church's own payment gateway (Razorpay, PayU or Cashfree) and
// choose which one its own-account payments use.
export function GatewayAccountsCard({ connected, active }: { connected: Record<Gateway, boolean>; active: Gateway }) {
  const [selected, setSelected] = useState<Gateway>(connected[active] ? active : (GATEWAYS.find((g) => connected[g]) ?? active));
  const [editing, setEditing] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [environment, setEnvironment] = useState("live");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fields = GATEWAY_FIELDS[selected];
  const isConnected = connected[selected];

  function run(action: () => Promise<{ error?: string; success?: boolean }>, done: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(done);
      setEditing(false);
      setKeyId("");
      setKeySecret("");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Landmark className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold">Your own payment gateway</h3>
            <p className="text-xs text-muted-foreground">
              Connect Razorpay, PayU or Cashfree so gifts that use &quot;your own account&quot; go straight to you. Keys are stored securely and never shown again.
            </p>
          </div>
        </div>

        <ErrorToast message={error} />
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {GATEWAYS.map((gateway) => (
            <Button
              key={gateway}
              type="button"
              size="sm"
              variant={selected === gateway ? "default" : "outline"}
              onClick={() => {
                setSelected(gateway);
                setEditing(false);
                setError(null);
                setNotice(null);
              }}
            >
              {GATEWAY_LABELS[gateway]}
              {connected[gateway] ? (active === gateway ? " · in use" : " · connected") : ""}
            </Button>
          ))}
        </div>

        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              {isConnected ? "Update keys" : `Connect ${GATEWAY_LABELS[selected]}`}
            </Button>
            {isConnected && active !== selected && (
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => setOwnGatewayAction(selected), `${GATEWAY_LABELS[selected]} is now used for your own-account payments.`)}>
                Use {GATEWAY_LABELS[selected]}
              </Button>
            )}
            {isConnected && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Disconnect ${GATEWAY_LABELS[selected]}? Payment links that rely on it will stop working.`)) {
                    run(() => removeGatewayAccountAction(selected), `${GATEWAY_LABELS[selected]} disconnected.`);
                  }
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
        )}

        {editing && (
          <form
            className="space-y-3 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveGatewayAccountAction(selected, keyId, keySecret, environment), `${GATEWAY_LABELS[selected]} connected and in use.`);
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gw-key-id" className="text-xs">
                  {fields.keyIdLabel}
                </Label>
                <Input id="gw-key-id" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder={fields.keyIdPlaceholder} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gw-key-secret" className="text-xs">
                  {fields.keySecretLabel}
                </Label>
                <Input id="gw-key-secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="••••••••••••" required />
              </div>
            </div>
            {fields.hasEnvironment && (
              <div className="flex gap-2">
                {(["live", "test"] as const).map((value) => (
                  <Button key={value} type="button" size="sm" variant={environment === value ? "secondary" : "outline"} onClick={() => setEnvironment(value)}>
                    {value === "live" ? "Live" : "Test (sandbox)"}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{fields.help}</p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
