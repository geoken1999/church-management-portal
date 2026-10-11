"use client";

import { useState, useTransition } from "react";
import { saveWhatsAppFallbackAction } from "@/lib/whatsapp/fallback-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LABELS = { none: "Do nothing", sms: "Send it by SMS", email: "Send it by email" } as const;

// The church's choice for what happens to an automatic message (birthday,
// anniversary, staff digest) that WhatsApp can't deliver.
export function WhatsAppFallbackCard({ initial }: { initial: "none" | "sms" | "email" }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function handleChange(next: "none" | "sms" | "email") {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await saveWhatsAppFallbackAction(next);
      if (result.error) {
        setValue(previous);
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "success", text: "Saved." });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">If WhatsApp can&apos;t deliver an automatic message</p>
            <p className="text-sm text-muted-foreground">
              WhatsApp sometimes refuses to deliver a message to a person (for example when it limits marketing messages to them). For birthday and anniversary greetings and the staff digest, choose
              what to do then. Uses your SMS or email allowance.
            </p>
          </div>
          <Select value={value} onValueChange={(v) => handleChange((v ?? "none") as "none" | "sms" | "email")} disabled={pending}>
            <SelectTrigger className="w-48" aria-label="Fallback">
              <SelectValue>{() => LABELS[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
