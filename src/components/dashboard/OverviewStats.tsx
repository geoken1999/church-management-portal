import { Users, CalendarCheck, HandCoins, Church } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Placeholder numbers — nothing here reads from real data yet (there's no
// members/attendance/giving module). Swap these for real queries once those
// modules land; the layout/shape is what's being built now.
const STATS = [
  { label: "Total members", value: "248", trend: "+12 this month", icon: Users },
  { label: "Attendance last Sunday", value: "182", trend: "+4% vs. prior week", icon: CalendarCheck },
  { label: "Giving this month", value: "$14,320", trend: "+8% vs. last month", icon: HandCoins },
  { label: "Active ministries", value: "9", trend: "2 new this quarter", icon: Church },
];

export function OverviewStats() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-lg font-bold">Overview</h2>
        <Badge variant="secondary">Sample data</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
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
