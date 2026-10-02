"use client";

import { Gauge, MessageSquareText, Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export interface CreditWallet {
  planRemaining: number;
  planLimit: number;
  addon: number;
}

// Same icon-button + Popover pattern as LanguageSwitcher, right next to it
// in the header. Shown as a wallet — each resource's plan allotment and
// add-on balance kept as two separate figures, not merged into one
// "remaining" total — since they behave differently (plan resets monthly,
// add-on is a persistent purchased balance that only draws down once the
// plan portion runs out). Receives plain numbers rather than calling
// getPlanUsage itself, since that's a server-only DAL call — the dashboard
// layout fetches it once and threads it down.
export function CreditBalances({ sms, ai, email }: { sms: CreditWallet; ai: CreditWallet; email: CreditWallet }) {
  const rows = [
    { label: "SMS", wallet: sms, icon: MessageSquareText },
    { label: "AI credits", wallet: ai, icon: Sparkles },
    { label: "Mail", wallet: email, icon: Mail },
  ];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label="Credit balances">
            <Gauge className="size-4.5" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64">
        <p className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">Credits</p>
        <div className="flex flex-col divide-y divide-border">
          {rows.map(({ label, wallet, icon: Icon }) => (
            <div key={label} className="flex items-start gap-2.5 px-1.5 py-2">
              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Plan</span>
                  <span className="tabular-nums">
                    {wallet.planRemaining.toLocaleString()} / {wallet.planLimit.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Add-on</span>
                  <span className="tabular-nums">{wallet.addon.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
