import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Shown in place of a module's content when the org's plan doesn't include
// it — distinct from AccessRestricted, which is about a specific user's
// permissions within an org that already has the feature. This applies
// uniformly to everyone in the org, including the owner, since there's no
// self-serve upgrade flow yet to route them to instead.
export function UpgradeRequired({ label, plan }: { label: string; plan: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Upgrade to unlock {label}
        </CardTitle>
        <CardDescription>
          {label} isn&apos;t included on the {plan} plan. Contact us to upgrade your organization&apos;s plan.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
