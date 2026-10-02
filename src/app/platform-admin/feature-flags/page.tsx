import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllFeatureFlags } from "@/lib/platform-admin/feature-flags";
import { TAB_LABELS } from "@/lib/permissions/tabs";
import { FeatureFlagToggle } from "@/components/platform-admin/FeatureFlagToggle";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Feature Flags | KingdomFlow Super Admin",
};

export default async function PlatformAdminFeatureFlagsPage() {
  await requirePlatformAdmin();
  const flags = await getAllFeatureFlags();
  const disabledCount = flags.filter((f) => !f.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Feature Flags</h1>
        <p className="mt-1 text-muted-foreground">
          Turn any tab off for every tenant at once — this overrides each organization&apos;s own plan and member
          permissions, including owners. Takes effect on their very next page load.
        </p>
      </div>

      {disabledCount > 0 && (
        <Badge variant="destructive">
          {disabledCount} feature{disabledCount === 1 ? "" : "s"} currently off platform-wide
        </Badge>
      )}

      <Card className="overflow-hidden py-0">
        <div className="divide-y divide-border">
          {flags.map((flag) => (
            <div key={flag.tab} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-medium">{TAB_LABELS[flag.tab]}</p>
              <FeatureFlagToggle tab={flag.tab} label={TAB_LABELS[flag.tab]} enabled={flag.enabled} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
