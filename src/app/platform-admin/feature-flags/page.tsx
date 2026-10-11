import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllFeatureFlags } from "@/lib/platform-admin/feature-flags";
import { featureTag, featureTesterEmails } from "@/lib/platform-admin/feature-status";
import { TAB_LABELS } from "@/lib/permissions/tabs";
import { FeatureStatusSelect } from "@/components/platform-admin/FeatureStatusSelect";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPlatformDate } from "@/lib/platform-admin/format";

export const metadata: Metadata = {
  title: "Feature Flags | KingdomFlow Super Admin",
};

export default async function PlatformAdminFeatureFlagsPage() {
  await requirePlatformAdmin();
  const flags = await getAllFeatureFlags();
  const now = new Date();
  const notLive = flags.filter((f) => f.status !== "live");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Feature Flags</h1>
        <p className="mt-1 text-muted-foreground">
          Set each module&apos;s status for every tenant at once. This overrides each organization&apos;s own plan and member permissions, including owners, and takes effect on their very next page
          load.
        </p>
        <ul className="mt-3 space-y-0.5 text-sm text-muted-foreground">
          <li>
            <strong>Off</strong>: nobody can use it.
          </li>
          <li>
            <strong>Testing</strong>: only the test users ({featureTesterEmails().join(", ")}) can see it.
          </li>
          <li>
            <strong>Beta</strong>: everyone can use it, with a Beta tag in the menu.
          </li>
          <li>
            <strong>Live</strong>: everyone can use it. Moving from Beta to Live shows a New tag for 15 days.
          </li>
          <li>A newly added module starts in <strong>Testing</strong> until you move it.</li>
        </ul>
      </div>

      {notLive.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {notLive.map((f) => (
            <Badge key={f.tab} variant={f.status === "off" ? "destructive" : "secondary"}>
              {TAB_LABELS[f.tab]}: {f.status}
            </Badge>
          ))}
        </div>
      )}

      <Card className="overflow-hidden py-0">
        <div className="divide-y divide-border">
          {flags.map((flag) => {
            const tag = featureTag(flag.status, flag.newUntil, now);
            return (
              <div key={flag.tab} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{TAB_LABELS[flag.tab]}</p>
                  {tag === "new" && flag.newUntil && <Badge variant="secondary">New until {formatPlatformDate(flag.newUntil)}</Badge>}
                </div>
                <FeatureStatusSelect tab={flag.tab} label={TAB_LABELS[flag.tab]} status={flag.status} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
