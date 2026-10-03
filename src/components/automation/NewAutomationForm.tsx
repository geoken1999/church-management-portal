"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAutomationAction } from "@/lib/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function NewAutomationForm() {
  const router = useRouter();
  const [name, setName] = useState("Member Birthday & Anniversary Wishes");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createAutomationAction(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/automations/${result.id}/edit`);
    });
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>New Automation</CardTitle>
        <CardDescription>Name your automation — you&apos;ll configure its triggers, templates, and destinations next.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="automation-name">Name</Label>
          <Input id="automation-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="button" onClick={handleCreate} disabled={pending || !name.trim()}>
          {pending ? "Creating..." : "Create & continue"}
        </Button>
      </CardContent>
    </Card>
  );
}
