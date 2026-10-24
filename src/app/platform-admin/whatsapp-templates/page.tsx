import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_TEMPLATE_CATALOG } from "@/lib/whatsapp/platform-catalog";
import { PlatformTemplateButtons } from "@/components/platform-admin/PlatformTemplateButtons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlatformWhatsAppTemplate } from "@/types/database";

export const metadata: Metadata = {
  title: "WhatsApp Templates | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending_review: "secondary",
  rejected: "destructive",
  paused: "destructive",
  disabled: "destructive",
  draft: "outline",
};

export default async function PlatformAdminWhatsAppTemplatesPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("platform_whatsapp_templates").select("*");
  const submitted = new Map(((data ?? []) as PlatformWhatsAppTemplate[]).map((row) => [row.catalog_key, row]));
  const unsubmittedKeys = PLATFORM_TEMPLATE_CATALOG.filter((t) => !submitted.has(t.key)).map((t) => t.key);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">WhatsApp templates</h1>
        <p className="mt-1 text-muted-foreground">
          Ready-made messages every church can use. Each is sent to WhatsApp for review once, in the platform&apos;s own account. Once approved, it appears in the Templates list of every church
          sending from the shared number. Churches with their own number can add it to theirs.
        </p>
      </div>

      <PlatformTemplateButtons unsubmittedKeys={unsubmittedKeys} />

      <div className="space-y-3">
        {PLATFORM_TEMPLATE_CATALOG.map((template) => {
          const row = submitted.get(template.key);
          return (
            <Card key={template.key}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{template.name}</span>
                  </div>
                  {row ? <Badge variant={STATUS_VARIANTS[row.status] ?? "outline"}>{row.status.replace("_", " ")}</Badge> : <Badge variant="outline">not submitted</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                <p className="rounded-md bg-muted/50 p-2 text-sm">{template.body}</p>
                {template.urlButton && (
                  <p className="inline-block rounded-md border border-border px-3 py-1 text-sm font-medium text-primary">{template.urlButton.text}</p>
                )}
                {row?.rejected_reason && row.rejected_reason !== "NONE" && <p className="text-xs text-destructive">Rejected: {row.rejected_reason}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
