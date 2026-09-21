import Link from "next/link";
import { HandCoins, Gift, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getFinanceOverviewStats } from "@/lib/finance/dal";
import type { TabAccess } from "@/types/database";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function FinanceOverview({
  organizationId,
  access,
}: {
  organizationId: string;
  access: { offerings: TabAccess; donations: TabAccess; fundraisers: TabAccess };
}) {
  if (!access.offerings.read && !access.donations.read && !access.fundraisers.read) {
    return null;
  }

  const stats = await getFinanceOverviewStats(organizationId);

  const cards = [
    access.offerings.read && {
      href: "/dashboard/offerings",
      label: "Offerings this month",
      value: formatMoney(stats.offeringsThisMonth),
      icon: HandCoins,
    },
    access.donations.read && {
      href: "/dashboard/donations",
      label: "Donations this month",
      value: formatMoney(stats.donationsThisMonth),
      icon: Gift,
    },
    access.fundraisers.read && {
      href: "/dashboard/fundraisers",
      label: "Active fundraisers",
      value: stats.activeFundraiserCount.toLocaleString(),
      trend:
        stats.activeFundraiserGoal > 0
          ? `${formatMoney(stats.activeFundraiserRaised)} of ${formatMoney(stats.activeFundraiserGoal)} raised`
          : undefined,
      icon: Target,
    },
  ].filter((card): card is Exclude<typeof card, false> => Boolean(card));

  return (
    <div>
      <h2 className="mb-3 font-heading text-lg font-bold">Finance</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <stat.icon className="size-4 text-primary" />
                </div>
                <p className="font-heading text-2xl font-bold">{stat.value}</p>
                {stat.trend && <p className="text-xs text-muted-foreground">{stat.trend}</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
