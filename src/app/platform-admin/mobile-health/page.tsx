import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getMobileHealth } from "@/lib/mobile-health/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Mobile App Health | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "";
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className={`font-heading text-3xl font-bold ${color}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function BarList({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate pr-2">{row.label}</span>
            <span className="text-muted-foreground">{row.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${total ? Math.max(3, Math.round((row.count / total) * 100)) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function MobileHealthPage() {
  await requirePlatformAdmin();
  const h = await getMobileHealth();
  const crashFree = h.crashFreeRate === null ? "—" : `${(h.crashFreeRate * 100).toFixed(1)}%`;
  const crashTone = h.crashFreeRate === null ? undefined : h.crashFreeRate >= 0.99 ? "good" : h.crashFreeRate >= 0.97 ? "warn" : "bad";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Mobile app health</h1>
        <p className="mt-1 text-muted-foreground">
          What the KingdomFlow app reports about itself: who is using which version, how often a session ends badly, and which errors keep happening. Reports come from release builds only. A
          &ldquo;suspected crash&rdquo; is a session that was still in the foreground when the app next opened — the app never went to the background or closed normally, which is what a crash
          looks like from the inside.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Crash-free sessions (7 days)" value={crashFree} hint={`${h.crashes.last7d} suspected crashes in ${h.sessions.last7d} sessions`} tone={crashTone} />
        <Stat label="Active devices (24 hours)" value={String(h.devices.active24h)} hint={`${h.devices.active7d} in 7 days · ${h.devices.active30d} in 30 days`} />
        <Stat label="Errors caught (24 hours)" value={String(h.errors.last24h)} hint={`${h.errors.last7d} in 7 days`} tone={h.errors.last24h > 20 ? "warn" : undefined} />
        <Stat label="Suspected crashes (24 hours)" value={String(h.crashes.last24h)} hint={`${h.devices.total} devices have ever reported`} tone={h.crashes.last24h > 0 ? "warn" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>App versions</CardTitle>
            <CardDescription>Devices seen in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {h.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Version</th>
                    <th className="pb-2 font-medium">Android</th>
                    <th className="pb-2 font-medium">iOS</th>
                  </tr>
                </thead>
                <tbody>
                  {h.versions.map((v) => (
                    <tr key={v.version} className="border-t border-border">
                      <td className="py-1.5">{v.version}</td>
                      <td className="py-1.5">{v.android}</td>
                      <td className="py-1.5">{v.ios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Operating systems</CardTitle>
            <CardDescription>Most used</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList rows={h.osVersions} total={Math.max(1, h.devices.active30d)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Phone models</CardTitle>
            <CardDescription>Most used</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList rows={h.models} total={Math.max(1, h.devices.active30d)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Most frequent problems (7 days)</CardTitle>
          <CardDescription>The same error is counted once however many times it happened; the numbers show how often and on how many devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {h.topErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing reported in the last 7 days.</p>
          ) : (
            h.topErrors.map((g) => (
              <details key={`${g.kind}|${g.fingerprint}`} className="rounded-lg border border-border px-3 py-2">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                  <Badge variant={g.kind === "crash_suspected" ? "destructive" : "secondary"}>{g.kind === "crash_suspected" ? "Suspected crash" : "Error"}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{g.message || "(no message)"}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.count}× · {g.devices} device{g.devices === 1 ? "" : "s"} · {ago(g.lastAt)}
                  </span>
                </summary>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    Screen: {g.screen || "unknown"} · Versions: {g.versions.join(", ") || "unknown"}
                  </p>
                  {g.stack && <pre className="max-h-48 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{g.stack}</pre>}
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent suspected crashes</CardTitle>
          <CardDescription>The newest first, with the screen the app was on when it last ran.</CardDescription>
        </CardHeader>
        <CardContent>
          {h.recentCrashes.length === 0 ? (
            <p className="text-sm text-muted-foreground">None in the last 7 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Version</th>
                  <th className="pb-2 font-medium">Phone</th>
                  <th className="pb-2 font-medium">Screen</th>
                  <th className="pb-2 font-medium">Church</th>
                </tr>
              </thead>
              <tbody>
                {h.recentCrashes.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5">{ago(c.at)}</td>
                    <td className="py-1.5">{c.appVersion || "—"}</td>
                    <td className="py-1.5">
                      {c.deviceModel || "—"} <span className="text-xs text-muted-foreground">({c.platform === "ios" ? "iOS" : "Android"} {c.osVersion})</span>
                    </td>
                    <td className="py-1.5">{c.screen || "—"}</td>
                    <td className="py-1.5">{c.church ?? "—"}</td>
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
