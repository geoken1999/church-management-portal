"use client";

import { useSyncExternalStore } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { getPaymentLoadingState, getServerPaymentLoadingState, subscribePaymentLoading } from "@/lib/razorpay/loading";

// Covers the screen while a payment is being set up or confirmed (see src/lib/razorpay/loading.ts). Sits above
// dialogs, so it also covers the billing-details dialog while the order is created.
export function PaymentLoadingOverlay() {
  const { open, message } = useSyncExternalStore(subscribePaymentLoading, getPaymentLoadingState, getServerPaymentLoadingState);
  if (!open) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-8 text-center shadow-lg">
        <Loader2 className="size-10 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
        <p className="font-medium">{message}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Secure payment. Please don&apos;t close or refresh this page.
        </p>
      </div>
    </div>
  );
}
