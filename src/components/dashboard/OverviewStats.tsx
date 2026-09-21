import { Users, CalendarCheck, UserCog, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardOverviewStats } from "@/lib/dashboard/dal";

export async function OverviewStats({ organizationId }: { organizationId: string }) {
  const stats = await getDashboardOverviewStats(organizationId);

  const cards = [
    {
      label: "Total members",
      value: stats.totalMembers.toLocaleString(),
      trend: `${stats.newMembersThisMonth > 0 ? "+" : ""}${stats.newMembersThisMonth} this month`,
      icon: Users,
    },
    {
      label: "Upcoming events",
      value: stats.upcomingEvents.toLocaleString(),
      trend: `${stats.eventsThisWeek} this week`,
      icon: CalendarCheck,
    },
    {
      label: "Team members",
      value: stats.teamMembers.toLocaleString(),
      trend: `${stats.teamAdmins} ${stats.teamAdmins === 1 ? "admin" : "admins"}`,
      icon: UserCog,
    },
    {
      label: "Branches",
      value: stats.branches.toLocaleString(),
      trend: stats.branches === 1 ? "1 location" : `${stats.branches} locations`,
      icon: MapPin,
    },
  ];

  return (
    <div>
      <h2 className="mb-3 font-heading text-lg font-bold">Overview</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <stat.icon className="size-4 text-primary" />
              </div>
              <p className="font-heading text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
