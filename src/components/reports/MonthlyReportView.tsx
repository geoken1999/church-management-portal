import type { MonthlyReportData } from "@/lib/reports/monthly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// A saved monthly church report, as the team sees it on the web (and prints).
export function MonthlyReportView({ data, churchName, note }: { data: MonthlyReportData; churchName: string; note: string | null }) {
  const maxCategory = Math.max(1, ...(data.giving?.byCategory.map((c) => c.amount) ?? [1]));
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{churchName}</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{data.label}</h1>
        <p className="text-xs text-muted-foreground">Monthly church report · made {new Date(data.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      {note && (
        <Card>
          <CardContent className="whitespace-pre-wrap text-sm">{note}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.members && (
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label="On record" value={String(data.members.total)} />
              <Figure label="Joined this month" value={String(data.members.joined)} />
            </CardContent>
          </Card>
        )}

        {data.attendance && (
          <Card>
            <CardHeader>
              <CardTitle>Attendance</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label="Services recorded" value={String(data.attendance.services)} />
              <Figure label="Average per service" value={String(data.attendance.average)} />
              <Figure label="Total attendance" value={String(data.attendance.total)} />
              {data.attendance.best && <Figure label="Best attended" value={String(data.attendance.best.count)} hint={`${data.attendance.best.title}, ${day(data.attendance.best.date)}`} />}
            </CardContent>
          </Card>
        )}

        {data.giving && (
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>Giving</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Figure label="Offerings" value={rupees(data.giving.offerings)} />
                <Figure label="Donations" value={rupees(data.giving.donations)} />
                <Figure label="Total" value={rupees(data.giving.total)} />
              </div>
              {data.giving.byCategory.length > 0 && (
                <ul className="space-y-2">
                  {data.giving.byCategory.map((c) => (
                    <li key={c.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="text-muted-foreground">{rupees(c.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(3, Math.round((c.amount / maxCategory) * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {data.expenses && (
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>Expenses and balance</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <Figure label="Giving received" value={rupees(data.expenses.income)} />
              <Figure label="Expenses" value={rupees(data.expenses.expenses)} />
              <Figure label="Left over" value={rupees(data.expenses.balance)} />
            </CardContent>
          </Card>
        )}

        {data.events && (
          <Card>
            <CardHeader>
              <CardTitle>Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Figure label="Events held" value={String(data.events.held)} />
              {data.events.list.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {data.events.list.map((e, i) => (
                    <li key={`${e.title}-${i}`} className="flex justify-between gap-3">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 text-muted-foreground">{day(e.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {data.volunteers && (
          <Card>
            <CardHeader>
              <CardTitle>Volunteers</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label="Active" value={String(data.volunteers.active)} />
              <Figure label="Joined this month" value={String(data.volunteers.joined)} />
            </CardContent>
          </Card>
        )}

        {data.prayer && (
          <Card>
            <CardHeader>
              <CardTitle>Prayer requests</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label="Received" value={String(data.prayer.received)} />
              <Figure label="Answered" value={String(data.prayer.answered)} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
