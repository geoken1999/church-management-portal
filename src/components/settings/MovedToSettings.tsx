import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SettingsSectionKey } from "@/components/settings/SettingsNav";

// Where a setting used to be: it now lives in Church settings, so point there.
export function MovedToSettings({ what, section, label }: { what: string; section: SettingsSectionKey; label: string }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {what} {what.endsWith("s") ? "are" : "is"} now managed in Church settings.
        </p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/settings?section=${section}`} />}>
          <Settings className="size-3.5" />
          {label}
        </Button>
      </CardContent>
    </Card>
  );
}
