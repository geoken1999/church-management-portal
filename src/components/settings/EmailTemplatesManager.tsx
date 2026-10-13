"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteEmailTemplateAction } from "@/lib/email/template-actions";
import { BUILT_IN_EMAIL_TEMPLATES } from "@/lib/email/templates";
import type { EmailTemplate } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

// The church's saved email templates, and the ready-made ones it can start from.
export function EmailTemplatesManager({ templates, canManage }: { templates: EmailTemplate[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEmailTemplateAction(id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <ErrorToast message={error} />
      <CardHeader>
        <CardTitle className="text-sm">Email templates</CardTitle>
        <CardDescription>
          Messages you can start an email from. To make a new one, write it in the{" "}
          <Link href="/dashboard/email" className="underline underline-offset-2">
            Email composer
          </Link>{" "}
          and press Save as template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your templates</p>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.subject || "No subject"}</p>
                  </div>
                  {canManage && (
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(t.id)}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ready-made</p>
          <ul className="flex flex-wrap gap-1.5">
            {BUILT_IN_EMAIL_TEMPLATES.map((t) => (
              <li key={t.key}>
                <Badge variant="outline" title={t.description}>
                  {t.name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
