import { Clock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BillingManager } from "@/components/billing/BillingManager";
import type { PlanId } from "@/lib/plans/config";
import type { OrganizationSubscription } from "@/types/database";

// Rendered by dashboard/layout.tsx *instead of* the normal DashboardShell
// for every /dashboard/* route once an org's trial has run out with no
// active subscription — a hard gate rather than a per-page banner, since
// the request was to actually stop them from using the app until they
// subscribe, not just nudge them.
export function TrialExpiredScreen({
  organizationName,
  canManage,
  currentPlanId,
  subscription,
  razorpayConfigured,
  prefill,
}: {
  organizationName: string;
  canManage: boolean;
  currentPlanId: PlanId;
  subscription: OrganizationSubscription | null;
  razorpayConfigured: boolean;
  prefill: { name: string; email: string; contact: string };
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent">
            <Clock className="size-6 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Your trial has ended</h1>
          <p className="mt-2 text-muted-foreground">
            {organizationName}&apos;s 14-day trial is over.{" "}
            {canManage
              ? "Subscribe to a plan below to keep using KingdomFlow."
              : "Ask an owner or admin to subscribe to a plan to keep using KingdomFlow."}
          </p>
        </div>

        {canManage ? (
          <BillingManager
            currentPlanId={currentPlanId}
            subscription={subscription}
            razorpayConfigured={razorpayConfigured}
            prefill={prefill}
          />
        ) : null}
      </main>
    </div>
  );
}
