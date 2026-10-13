import type { MonthlyReportData } from "@/lib/reports/monthly";
import { reportLabels } from "@/lib/reports/monthly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// A saved monthly or annual church report, as the team sees it on the web (and prints):
// the church's letterhead on top, an AI-written summary if there is one, then the
// figures and photos, all in the language the report was made in.
export function MonthlyReportView({ data, note, photoUrl }: { data: MonthlyReportData; note: string | null; photoUrl: (path: string) => string }) {
  const t = { ...reportLabels(data.language ?? "en"), ...(data.labels ?? {}) };
  const annual = data.kind === "annual";
  const head = data.letterhead;
  const maxCategory = Math.max(1, ...(data.giving?.byCategory.map((c) => c.amount) ?? [1]));
  const maxMonth = Math.max(1, ...(data.byMonth?.map((m) => Math.max(m.giving, m.expenses)) ?? [1]));
  const contact = [head?.phone, head?.email, head?.website].filter(Boolean).join("  ·  ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-border pb-5">
        {data.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logoUrl} alt="" className="size-16 shrink-0 rounded-xl object-contain" />
        )}
        <div className="min-w-0">
          <p className="font-heading text-xl font-bold">{head?.churchName}</p>
          {head?.address && <p className="text-sm text-muted-foreground">{head.address}</p>}
          {contact && <p className="text-sm text-muted-foreground">{contact}</p>}
        </div>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{annual ? t.titleAnnual : t.titleMonthly}</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{data.label}</h1>
        <p className="text-xs text-muted-foreground">
          {data.branchName ? `${t.branch}: ${data.branchName}` : t.wholeChurch} · {t.madeOn} {new Date(data.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {data.narrative && (
        <Card>
          <CardHeader>
            <CardTitle>{t.summary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.narrative.text.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
            {data.narrative.highlights.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {data.narrative.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            <p className="pt-1 text-xs text-muted-foreground">{t.aiNote}</p>
          </CardContent>
        </Card>
      )}

      {note && (
        <Card>
          <CardContent className="whitespace-pre-wrap text-sm">{note}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.members && (
          <Card>
            <CardHeader>
              <CardTitle>{t.members}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label={t.onRecord} value={String(data.members.total)} />
              <Figure label={annual ? t.joinedYear : t.joinedMonth} value={String(data.members.joined)} />
            </CardContent>
          </Card>
        )}

        {data.attendance && (
          <Card>
            <CardHeader>
              <CardTitle>{t.attendance}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label={t.services} value={String(data.attendance.services)} />
              <Figure label={t.average} value={String(data.attendance.average)} />
              <Figure label={t.totalAttendance} value={String(data.attendance.total)} />
              {data.attendance.best && <Figure label={t.best} value={String(data.attendance.best.count)} hint={`${data.attendance.best.title}, ${data.attendance.best.dateLabel ?? data.attendance.best.date}`} />}
            </CardContent>
          </Card>
        )}

        {data.giving && (
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>{t.giving}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Figure label={t.offerings} value={rupees(data.giving.offerings)} />
                <Figure label={t.donations} value={rupees(data.giving.donations)} />
                <Figure label={t.total} value={rupees(data.giving.total)} />
              </div>
              {data.branchName && <p className="text-xs text-muted-foreground">{t.donationsNote}</p>}
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
              <CardTitle>{t.expensesBalance}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <Figure label={t.givingReceived} value={rupees(data.expenses.income)} />
              <Figure label={t.expenses} value={rupees(data.expenses.expenses)} />
              <Figure label={t.leftOver} value={rupees(data.expenses.balance)} />
            </CardContent>
          </Card>
        )}

        {data.byMonth && (
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>{t.byMonth}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-1.5">
                {data.byMonth.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end gap-0.5">
                      <div className="w-1/2 rounded-t bg-primary" style={{ height: `${Math.round((m.giving / maxMonth) * 100)}%` }} title={`${t.giving}: ${rupees(m.giving)}`} />
                      <div className="w-1/2 rounded-t bg-muted-foreground/40" style={{ height: `${Math.round((m.expenses / maxMonth) * 100)}%` }} title={`${t.expenses}: ${rupees(m.expenses)}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" />
                  {t.giving}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-muted-foreground/40" />
                  {t.expenses}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {data.events && (
          <Card>
            <CardHeader>
              <CardTitle>{t.events}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Figure label={t.eventsHeld} value={String(data.events.held)} />
              {data.events.list.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {data.events.list.map((e, i) => (
                    <li key={`${e.title}-${i}`} className="flex justify-between gap-3">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 text-muted-foreground">{e.dateLabel ?? e.date}</span>
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
              <CardTitle>{t.volunteers}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label={t.active} value={String(data.volunteers.active)} />
              <Figure label={annual ? t.joinedYear : t.joinedMonth} value={String(data.volunteers.joined)} />
            </CardContent>
          </Card>
        )}

        {data.prayer && (
          <Card>
            <CardHeader>
              <CardTitle>{t.prayer}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Figure label={t.received} value={String(data.prayer.received)} />
              <Figure label={t.answered} value={String(data.prayer.answered)} />
            </CardContent>
          </Card>
        )}
      </div>

      {data.photos && data.photos.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-lg font-bold">{t.photos}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.photos.map((photo) => (
              <figure key={photo.path} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(photo.path)} alt={photo.caption} className="aspect-[4/3] w-full rounded-lg object-cover" />
                {photo.caption && <figcaption className="text-xs text-muted-foreground">{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
