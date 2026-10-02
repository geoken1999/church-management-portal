"use client";

import { Gauge, MessageSquareText, Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Same icon-button + Popover pattern as LanguageSwitcher, right next to it
// in the header — a glanceable summary of the three shared-resource
// balances (plan quota remaining + any add-on credits, already combined by
// getPlanUsage) that actually run out: SMS and AI replies cost real money
// per send through this app's own accounts, email far less so but still
// capped. Receives plain numbers rather than calling getPlanUsage itself,
// since that's a server-only DAL call — the dashboard layout fetches it
// once and threads it down.
export function CreditBalances({ sms, ai, email }: { sms: number; ai: number; email: number }) {
  const rows = [
    { label: "SMS", value: sms, icon: MessageSquareText },
    { label: "AI credits", value: ai, icon: Sparkles },
    { label: "Mail", value: email, icon: Mail },
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
      <PopoverContent align="end" className="w-56">
        <p className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">Credits remaining</p>
        <div className="flex flex-col gap-0.5">
          {rows.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <Icon className="size-3.5 text-muted-foreground" />
                {label}
              </span>
              <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
