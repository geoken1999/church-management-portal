"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, Tag, CalendarDays, Compass, Target, Lightbulb } from "lucide-react";
import {
  createMinistry,
  updateMinistry,
  deleteMinistry,
  type MinistryFormState,
} from "@/lib/ministries/actions";
import type { Member, Ministry } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name">;
type MinistryRow = Ministry & { members: MemberBasic | null };

const initialState: MinistryFormState = {};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

function formatStartedOn(iso: string | null): string {
  if (!iso) return "Start date not set";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function MinistryFields({
  ministry,
  members,
  managedBy,
  onManagedByChange,
  errors,
}: {
  ministry?: Ministry;
  members: MemberBasic[];
  managedBy: string;
  onManagedByChange: (value: string) => void;
  errors?: MinistryFieldErrorsProp;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Ministry title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={ministry?.title}
          placeholder="Youth Ministry"
          required
          aria-invalid={Boolean(errors?.title)}
          aria-describedby={errors?.title ? "title-error" : undefined}
        />
        <FieldError id="title-error" message={errors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Input id="type" name="type" defaultValue={ministry?.type ?? ""} placeholder="Outreach, Worship, Children's..." />
      </div>
      <div className="space-y-2">
        <Label htmlFor="managedBy">Managed by</Label>
        <Select value={managedBy} onValueChange={(v) => onManagedByChange(v ?? "")}>
          <SelectTrigger id="managedBy" className="w-full">
            <SelectValue placeholder="Unassigned">
              {(v: string | null) => personName(members.find((m) => m.id === v) ?? null)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Unassigned</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="startedOn">When started</Label>
        <Input id="startedOn" name="startedOn" type="date" defaultValue={ministry?.started_on ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vision">Vision</Label>
        <Textarea id="vision" name="vision" defaultValue={ministry?.vision ?? ""} rows={3} placeholder="The long-term aspiration for this ministry" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mission">Mission</Label>
        <Textarea id="mission" name="mission" defaultValue={ministry?.mission ?? ""} rows={3} placeholder="What this ministry does day-to-day" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="futurePlans">Future plans</Label>
        <Textarea id="futurePlans" name="futurePlans" defaultValue={ministry?.future_plans ?? ""} rows={3} />
      </div>
    </div>
  );
}

type MinistryFieldErrorsProp = MinistryFormState["fieldErrors"];

function AddMinistryDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<MinistryFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMinistry(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialState);
          setManagedBy("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add ministry
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a ministry</DialogTitle>
          <DialogDescription>Record the basics for a ministry your church runs.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="managedBy" value={managedBy} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <MinistryFields members={members} managedBy={managedBy} onManagedByChange={setManagedBy} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add ministry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMinistryDialog({ ministry, members }: { ministry: Ministry; members: MemberBasic[] }) {
  const [state, setState] = useState<MinistryFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState(ministry.managed_by ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateMinistry(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialState);
          setManagedBy(ministry.managed_by ?? "");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Pencil className="size-3.5" />
            Edit
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit ministry</DialogTitle>
          <DialogDescription>Update this ministry&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <input type="hidden" name="ministryId" value={ministry.id} />
          <input type="hidden" name="managedBy" value={managedBy} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <MinistryFields ministry={ministry} members={members} managedBy={managedBy} onManagedByChange={setManagedBy} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MinistryCard({
  ministry,
  members,
  canManage,
}: {
  ministry: MinistryRow;
  members: MemberBasic[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-base font-bold">{ministry.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {ministry.type && (
                <Badge variant="secondary">
                  <Tag className="size-3" />
                  {ministry.type}
                </Badge>
              )}
              <span className="flex items-center gap-1">
                <UserRound className="size-3.5" />
                {personName(ministry.members)}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {formatStartedOn(ministry.started_on)}
              </span>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1">
              <EditMinistryDialog ministry={ministry} members={members} />
              <form action={deleteMinistry}>
                <input type="hidden" name="ministryId" value={ministry.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            </div>
          )}
        </div>

        {(ministry.vision || ministry.mission || ministry.future_plans) && (
          <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
            {ministry.vision && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Compass className="size-3.5" />
                  Vision
                </p>
                <p className="text-sm">{ministry.vision}</p>
              </div>
            )}
            {ministry.mission && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" />
                  Mission
                </p>
                <p className="text-sm">{ministry.mission}</p>
              </div>
            )}
            {ministry.future_plans && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lightbulb className="size-3.5" />
                  Future plans
                </p>
                <p className="text-sm">{ministry.future_plans}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MinistriesManager({
  organizationId,
  ministries,
  members,
  canManage,
}: {
  organizationId: string;
  ministries: MinistryRow[];
  members: MemberBasic[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddMinistryDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {ministries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No ministries yet. {canManage && 'Click "Add ministry" to add your first one.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {ministries.map((ministry) => (
            <MinistryCard key={ministry.id} ministry={ministry} members={members} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
