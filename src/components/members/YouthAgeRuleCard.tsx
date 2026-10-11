"use client";

import { useState, useTransition } from "react";
import { GraduationCap } from "lucide-react";
import { saveYouthAgeRuleAction } from "@/lib/youth/age-rule-actions";
import { YOUTH_AGE_MAX, YOUTH_AGE_MIN } from "@/lib/youth/age-rule";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Where an admin sets who counts as Youth by age. Saving brings the Youth
// list in line straight away; the app then keeps it current as members are
// added or edited and as birthdays pass.
export function YouthAgeRuleCard({ initialFrom, initialTo }: { initialFrom: number | null; initialTo: number | null }) {
  const [from, setFrom] = useState(initialFrom === null ? "" : String(initialFrom));
  const [to, setTo] = useState(initialTo === null ? "" : String(initialTo));
  const [savedFrom, setSavedFrom] = useState(from);
  const [savedTo, setSavedTo] = useState(to);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const dirty = from !== savedFrom || to !== savedTo;
  const active = savedFrom !== "" && savedTo !== "";

  function save(nextFrom: string, nextTo: string) {
    startTransition(async () => {
      const result = await saveYouthAgeRuleAction(nextFrom, nextTo);
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setFrom(nextFrom);
      setTo(nextTo);
      setSavedFrom(nextFrom);
      setSavedTo(nextTo);
      const added = result.added ?? 0;
      const removed = result.removed ?? 0;
      setMessage({
        kind: "success",
        text:
          nextFrom === "" && nextTo === ""
            ? `Age rule turned off.${removed > 0 ? ` ${removed} member${removed === 1 ? "" : "s"} it added were taken off Youth.` : ""}`
            : `Saved. ${added} member${added === 1 ? "" : "s"} added to Youth${removed > 0 ? `, ${removed} taken off` : ""}.`,
      });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent">
            <GraduationCap className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Youth age rule</p>
            <p className="text-sm text-muted-foreground">
              Members whose age falls in this range are added to Youth automatically, as they join and as they have birthdays. Someone the rule added is taken off again when they age out;
              anyone you added to Youth yourself stays. Needs each member&apos;s date of birth.
            </p>
          </div>
        </div>

        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="youth-age-from" className="text-xs">
              From age
            </Label>
            <Input id="youth-age-from" type="number" min={YOUTH_AGE_MIN} max={YOUTH_AGE_MAX} value={from} onChange={(e) => setFrom(e.target.value)} className="w-24" placeholder="13" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="youth-age-to" className="text-xs">
              To age
            </Label>
            <Input id="youth-age-to" type="number" min={YOUTH_AGE_MIN} max={YOUTH_AGE_MAX} value={to} onChange={(e) => setTo(e.target.value)} className="w-24" placeholder="25" />
          </div>
          <Button type="button" size="sm" onClick={() => save(from, to)} disabled={pending || !dirty}>
            {pending ? "Saving..." : "Save rule"}
          </Button>
          {active && (
            <Button type="button" size="sm" variant="ghost" onClick={() => save("", "")} disabled={pending}>
              Turn off
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
