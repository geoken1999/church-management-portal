import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAutoDeleteOn } from "@/lib/retention/settings";
import { daysSince, deletionDate, nextAction, RETENTION_DAYS } from "@/lib/retention/rules";
import { AutoDeleteSwitch, KeepForeverButton } from "@/components/platform-admin/RetentionControls";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Lapsed Churches | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

const formatDate = (iso: string | Date) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const BLOCKED_LABELS: Record<string, string> = {
  owed_money: "Owed money — settle the payout first",
  no_contact_email: "No owner/admin email to warn",
};

export default async function RetentionPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const now = new Date();
  const autoDelete = await isAutoDeleteOn();

  const [{ data: rows }, { data: deleted }] = await Promise.all([
    admin.from("organization_retention").select("*").order("expired_since", { ascending: true }),
    admin.from("deleted_organizations").select("*").order("deleted_at", { ascending: false }).limit(20),
  ]);
  const ids = (rows ?? []).map((r) => r.organization_id);
  const { data: orgs } = ids.length ? await admin.from("organizations").select("id, name").in("id", ids) : { data: [] };
  const nameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const list = (rows ?? []).map((r) => {
    const expiredSince = new Date(r.expired_since);
    const action = nextAction({ expiredSince, remindersSent: r.reminders_sent, finalWarningSentAt: r.final_warning_sent_at ? new Date(r.final_warning_sent_at) : null }, now);
    return { row: r, name: nameById.get(r.organization_id) ?? "Unknown church", day: daysSince(expiredSince, now), deleteOn: deletionDate(expiredSince), action };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Lapsed churches</h1>
        <p className="mt-1 text-muted-foreground">
          A church whose access has ended — its free trial is over, or its paid subscription was cancelled or lapsed — is reminded every 7 days to resubscribe and warned the day before, and after{" "}
          {RETENTION_DAYS} days its account and all of its data are deleted for good. The countdown starts when the daily job first sees the church without access, and stops by itself if the church
          resubscribes. A church that is still owed money, or that you mark to keep, is never deleted.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Automatic deletion</span>
              <Badge variant={autoDelete ? "destructive" : "secondary"}>{autoDelete ? "ON" : "OFF"}</Badge>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              {autoDelete
                ? "The daily job deletes churches once they are due. Deletion is permanent."
                : "Off: reminders and warnings still go out, but nothing is deleted. Churches that reach their deadline are listed below as waiting."}
            </p>
          </div>
          <AutoDeleteSwitch on={autoDelete} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Counting down ({list.length})</CardTitle>
          <CardDescription>Oldest first. The job runs once a day; you can also run it from Cron Jobs (&ldquo;Lapsed churches&rdquo;).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No church is counting down.</p>
          ) : (
            list.map(({ row, name, day, deleteOn, action }) => (
              <div key={row.organization_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{name}</span>
                    {row.exempt && <Badge variant="secondary">Keeping forever</Badge>}
                    {row.blocked_reason && <Badge variant="destructive">{BLOCKED_LABELS[row.blocked_reason] ?? row.blocked_reason}</Badge>}
                    {!row.exempt && action === "delete" && !row.blocked_reason && <Badge variant={autoDelete ? "destructive" : "outline"}>{autoDelete ? "Deleted at the next run" : "Due — waiting for the switch"}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Day {day} of {RETENTION_DAYS} · counting since {formatDate(row.expired_since)} · deletion on {formatDate(deleteOn)} · {row.reminders_sent} reminder{row.reminders_sent === 1 ? "" : "s"} sent
                    {row.final_warning_sent_at ? ` · final warning sent ${formatDate(row.final_warning_sent_at)}` : ""}
                  </p>
                </div>
                <KeepForeverButton organizationId={row.organization_id} exempt={row.exempt} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deleted churches</CardTitle>
          <CardDescription>A record that each was deleted. The church&apos;s data itself is gone.</CardDescription>
        </CardHeader>
        <CardContent>
          {(deleted ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Church</th>
                  <th className="pb-2 font-medium">Owner email</th>
                  <th className="pb-2 font-medium">Access ended</th>
                  <th className="pb-2 font-medium">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {(deleted ?? []).map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-1.5">{d.name}</td>
                    <td className="py-1.5">{d.owner_email ?? "—"}</td>
                    <td className="py-1.5">{d.expired_since ? formatDate(d.expired_since) : "—"}</td>
                    <td className="py-1.5">{formatDate(d.deleted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
