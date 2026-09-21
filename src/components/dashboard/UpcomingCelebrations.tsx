import { Cake, HeartHandshake, PartyPopper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUpcomingCelebrations, type UpcomingCelebration } from "@/lib/dashboard/dal";

function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function CelebrationRow({ celebration }: { celebration: UpcomingCelebration }) {
  const Icon = celebration.type === "birthday" ? Cake : HeartHandshake;
  const detail =
    celebration.type === "birthday"
      ? `Turns ${celebration.years}`
      : `${celebration.years} ${celebration.years === 1 ? "year" : "years"} married`;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
        <Icon className="size-4 text-accent-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{celebration.name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatDayLabel(celebration.occursOn)}</span>
    </div>
  );
}

function CelebrationList({ items, emptyText }: { items: UpcomingCelebration[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {items.map((celebration) => (
        <CelebrationRow key={`${celebration.memberId}-${celebration.type}`} celebration={celebration} />
      ))}
    </div>
  );
}

export async function UpcomingCelebrations({ organizationId }: { organizationId: string }) {
  const { thisWeek, nextWeek } = await getUpcomingCelebrations(organizationId);

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
        <PartyPopper className="size-4 text-primary" />
        Birthdays & anniversaries
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">This week</CardTitle>
          </CardHeader>
          <CardContent>
            <CelebrationList items={thisWeek} emptyText="No birthdays or anniversaries this week." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Next week</CardTitle>
          </CardHeader>
          <CardContent>
            <CelebrationList items={nextWeek} emptyText="No birthdays or anniversaries next week." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
