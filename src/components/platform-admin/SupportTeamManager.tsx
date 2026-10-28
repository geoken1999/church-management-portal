"use client";

import { useActionState } from "react";
import { addSupportStaff, removeSupportStaff, setSupportStaffActive, type AddSupportStaffState } from "@/lib/support-staff/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupportStaff } from "@/types/database";

export function SupportTeamManager({ staff }: { staff: SupportStaff[] }) {
  const [state, action, pending] = useActionState<AddSupportStaffState, FormData>(addSupportStaff, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="support-name">Name</Label>
              <Input id="support-name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-email">Email</Label>
              <Input id="support-email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add support person"}
            </Button>
          </form>
          {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="mt-2 text-sm text-muted-foreground">{state.success}</p>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {staff.length === 0 && <p className="text-sm text-muted-foreground">No support people yet.</p>}
        {staff.map((person) => (
          <Card key={person.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{person.name}</span>
                  <Badge variant={person.active ? "secondary" : "outline"}>{person.active ? "Active" : "Switched off"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{person.email}</p>
              </div>
              <div className="flex gap-2">
                <form action={setSupportStaffActive}>
                  <input type="hidden" name="id" value={person.id} />
                  <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                  <Button type="submit" variant="outline" size="sm">
                    {person.active ? "Switch off" : "Switch on"}
                  </Button>
                </form>
                <form action={removeSupportStaff}>
                  <input type="hidden" name="id" value={person.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
