"use client";

import { useState, useTransition } from "react";
import { updateJoinBilingualAction } from "@/lib/members/join-bilingual-actions";
import { BilingualSettings, bilingualChoiceFrom, bilingualChoiceToField } from "@/components/BilingualSettings";
import type { BilingualConfig } from "@/lib/bilingual/config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Where an admin chooses whether the public join form shows two languages.
export function JoinFormLanguages({ initial }: { initial: BilingualConfig | null }) {
  const [choice, setChoice] = useState(bilingualChoiceFrom(initial));
  const [saved, setSaved] = useState(bilingualChoiceToField(bilingualChoiceFrom(initial)));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const current = bilingualChoiceToField(choice);

  function handleSave() {
    startTransition(async () => {
      const result = await updateJoinBilingualAction(current);
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setSaved(current);
      setMessage({ kind: "success", text: result.warning ?? "Saved. The join form now follows this language setting." });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <BilingualSettings value={choice} onChange={setChoice} noun="join form" />
        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
        <Button type="button" size="sm" onClick={handleSave} disabled={pending || current === saved}>
          {pending ? "Saving..." : "Save language setting"}
        </Button>
      </CardContent>
    </Card>
  );
}
