import type { Metadata } from "next";
import Link from "next/link";
import { Cake, ChevronRight, Users } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Automation | KingdomFlow",
};

// Each entry is one automation feature — a menu, not a submenu: picking
// one navigates straight into that feature's own existing pages (nothing
// about them changes). Birthday & anniversary wishes is the first;
// appending another entry here is all a future automation type needs.
const AUTOMATION_FEATURES = [
  {
    href: "/dashboard/automations",
    icon: Cake,
    title: "Automate Wishes for Members",
    description: "Send birthday and anniversary wishes to members automatically over WhatsApp.",
  },
  {
    href: "/dashboard/automation/followup",
    icon: Users,
    title: "Member Follow-up",
    description: "Create a To Do task for a leader when a member has missed several Sundays in a row. Nothing is sent to the member.",
  },
];

export default async function AutomationPage() {
  const membership = await requireOrganization();

  const plan = await getPlanLimits(membership.organization.id);
  if (plan.automationLimit === 0) {
    return <UpgradeRequired label="Automation" plan={plan.name} />;
  }

  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automation" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Automation</h1>
        <p className="mt-1 text-muted-foreground">
          Recurring tasks that run on their own, without anyone having to remember to do them by hand. Pick a feature below to set it up.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION_FEATURES.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-primary/20">
              <CardContent className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <feature.icon className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-sm font-bold">{feature.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
