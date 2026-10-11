"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addPlatformTemplateToMyAccountAction } from "@/lib/whatsapp/platform-template-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

// For a church using its own WhatsApp number: KingdomFlow's ready-made
// templates, which live in the platform's account, can be added to their own.
// WhatsApp reviews each copy, usually quickly since the wording is already
// proven.
export function PlatformTemplatesCard({ templates }: { templates: { id: string; name: string; body: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (templates.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">Ready-made templates</p>
          <p className="text-sm text-muted-foreground">Add any of these to your own WhatsApp account. WhatsApp reviews each one before you can send it.</p>
        </div>
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{template.name}</p>
                <p className="text-sm">{template.body}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await addPlatformTemplateToMyAccountAction(template.id);
                    setMessage(result.error ?? "Added. It will be usable once WhatsApp approves it.");
                  })
                }
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
