import { ShieldOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Shown when a member-role user navigates directly to a tab's URL despite
// it being hidden from their nav — the nav hiding in DashboardShell covers
// the common case, this is the defense-in-depth backstop.
export function AccessRestricted({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldOff className="size-4 text-muted-foreground" />
          Access restricted
        </CardTitle>
        <CardDescription>
          You don&apos;t have permission to view {label}. Ask an admin to update your access.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
