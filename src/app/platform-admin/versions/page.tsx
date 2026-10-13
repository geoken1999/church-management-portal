import type { Metadata } from "next";
import { Globe, Smartphone } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getMobileVersions } from "@/lib/mobile-health/dal";
import { getWebVersion } from "@/lib/version";
import { formatPlatformDate } from "@/lib/platform-admin/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Versions | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

const PLATFORM_NAMES = { android: "Android", ios: "iPhone (iOS)" } as const;

// The version of the web app that is running, and which versions of the mobile app are in use.
export default async function VersionsPage() {
  await requirePlatformAdmin();
  const web = getWebVersion();
  const mobile = await getMobileVersions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Versions</h1>
        <p className="mt-1 text-muted-foreground">What is live on the web, and which app versions people are using.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Globe className="size-4" />
            Web app
            <Badge>v{web.version}</Badge>
            {web.environment && <Badge variant="outline">{web.environment}</Badge>}
          </CardTitle>
          <CardDescription>The build serving this page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Version</p>
            <p className="font-heading text-2xl font-bold">{web.version}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Commit</p>
            <p className="font-mono">{web.commitShort || "unknown"}</p>
            {web.message && <p className="mt-0.5 text-muted-foreground">{web.message}</p>}
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Built</p>
            <p>{web.builtAt ? formatPlatformDate(web.builtAt) : "unknown"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["android", "ios"] as const).map((platform) => {
          const newest = mobile.newest[platform];
          const behind = mobile.behind[platform];
          return (
            <Card key={platform}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Smartphone className="size-4" />
                  {PLATFORM_NAMES[platform]}
                  {newest && (
                    <Badge>
                      v{newest.version} ({newest.build})
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{newest ? "Newest version seen in the field." : "No devices have reported in yet."}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Devices</p>
                  <p className="font-heading text-2xl font-bold">{mobile.totals[platform]}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">On newest</p>
                  <p className="font-heading text-2xl font-bold">{mobile.totals[platform] - behind}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Behind</p>
                  <p className={`font-heading text-2xl font-bold ${behind > 0 ? "text-amber-600" : ""}`}>{behind}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mobile app versions in use</CardTitle>
          <CardDescription>Every version that has reported in, newest first. Only release builds report.</CardDescription>
        </CardHeader>
        <CardContent>
          {mobile.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Platform</th>
                    <th className="py-2 pr-4">Version</th>
                    <th className="py-2 pr-4">Devices</th>
                    <th className="py-2 pr-4">Active (7 days)</th>
                    <th className="py-2 pr-4">First seen</th>
                    <th className="py-2">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {mobile.rows.map((row) => {
                    const isNewest = mobile.newest[row.platform]?.version === row.version && mobile.newest[row.platform]?.build === row.build;
                    return (
                      <tr key={`${row.platform}-${row.version}-${row.build}`} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4">{PLATFORM_NAMES[row.platform]}</td>
                        <td className="py-2 pr-4 font-mono">
                          {row.version} ({row.build}) {isNewest && <Badge variant="secondary">newest</Badge>}
                        </td>
                        <td className="py-2 pr-4">{row.devices}</td>
                        <td className="py-2 pr-4">{row.activeLast7d}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatPlatformDate(row.firstSeen)}</td>
                        <td className="py-2 text-muted-foreground">{formatPlatformDate(row.lastSeen)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
