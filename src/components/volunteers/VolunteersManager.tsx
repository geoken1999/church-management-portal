"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, StickyNote, HandHelping, CalendarDays, BadgeCheck } from "lucide-react";
import { createVolunteer, updateVolunteer, deleteVolunteer, setVolunteerVerified, type VolunteerFormState } from "@/lib/volunteers/actions";
import type { Volunteer, Member } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ui/error-toast";

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name" | "phone">;
type VolunteerRow = Volunteer & { members: MemberBasic | null };

const initialState: VolunteerFormState = {};
const NO_TEAM = "No team yet";

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

function VolunteerFields({
  entry,
  members,
  memberId,
  onMemberChange,
  status,
  onStatusChange,
  errors,
}: {
  entry?: Volunteer;
  members?: MemberBasic[];
  memberId: string;
  onMemberChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  errors?: VolunteerFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      {members && (
        <div className="space-y-2">
          <Label htmlFor="memberId">
            Member<span className="text-destructive">*</span>
          </Label>
          <Select value={memberId} onValueChange={(v) => onMemberChange(v ?? "")}>
            <SelectTrigger id="memberId" className="w-full" aria-invalid={Boolean(errors?.memberId)}>
              <SelectValue placeholder="Select a member">{(v: string | null) => personName(members.find((m) => m.id === v) ?? null)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.first_name} {member.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="memberId-error" message={errors?.memberId} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="role">Volunteers as</Label>
        <Input id="role" name="role" defaultValue={entry?.role} placeholder="Usher, Sound operator, Kitchen helper..." required aria-invalid={Boolean(errors?.role)} />
        <FieldError id="role-error" message={errors?.role} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="team">Team (optional)</Label>
          <Input id="team" name="team" defaultValue={entry?.team ?? ""} placeholder="Welcome team, Kids ministry..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="joinedOn">Volunteering since</Label>
          <Input id="joinedOn" name="joinedOn" type="date" defaultValue={entry?.joined_on ?? ""} aria-invalid={Boolean(errors?.joinedOn)} />
          <FieldError id="joinedOn-error" message={errors?.joinedOn} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <input type="hidden" name="status" value={status} />
        <Select value={status} onValueChange={(v) => onStatusChange(v ?? "active")}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue>{(v: string | null) => (v === "inactive" ? "Inactive (ID card shows as no longer active)" : "Active")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive (ID card shows as no longer active)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} placeholder="Optional notes (availability, skills...)" rows={2} />
      </div>
    </div>
  );
}

function AddVolunteerDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<VolunteerFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [status, setStatus] = useState("active");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createVolunteer(state, formData);
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
          setMemberId("");
          setStatus("active");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add volunteer
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a volunteer</DialogTitle>
          <DialogDescription>Pick a member and what they volunteer as. They get a volunteer ID automatically.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="memberId" value={memberId} />
          <ErrorToast message={state.error} />
          <VolunteerFields members={members} memberId={memberId} onMemberChange={setMemberId} status={status} onStatusChange={setStatus} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add volunteer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditVolunteerDialog({ entry }: { entry: Volunteer }) {
  const [state, setState] = useState<VolunteerFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(entry.status);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateVolunteer(state, formData);
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
          setStatus(entry.status);
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
          <DialogTitle>Edit volunteer {entry.volunteer_no}</DialogTitle>
          <DialogDescription>Update what they volunteer as, their team or whether they are still active.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          <ErrorToast message={state.error} />
          <VolunteerFields entry={entry} memberId={entry.member_id} onMemberChange={() => {}} status={status} onStatusChange={(v) => setStatus(v === "inactive" ? "inactive" : "active")} errors={state.fieldErrors} />
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

function VolunteerCard({ entry, canWrite, canDelete }: { entry: VolunteerRow; canWrite: boolean; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{personName(entry.members)}</h3>
            <Badge variant="outline">{entry.volunteer_no}</Badge>
            {entry.status === "inactive" && <Badge variant="destructive">Inactive</Badge>}
            {entry.verified && (
              <Badge className="gap-1">
                <BadgeCheck className="size-3" />
                Verified
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{entry.role}</Badge>
            {entry.members?.phone && <span className="text-sm text-muted-foreground">{entry.members.phone}</span>}
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5" />
              Since {new Date(entry.joined_on).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </span>
          </div>
          {entry.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {entry.notes}
            </p>
          )}
        </div>
        {(canWrite || canDelete) && (
          <div className="flex shrink-0 items-center gap-1">
            {canWrite && (
              <form action={setVolunteerVerified}>
                <input type="hidden" name="id" value={entry.id} />
                <input type="hidden" name="verified" value={entry.verified ? "false" : "true"} />
                <Button type="submit" variant="ghost" size="sm">
                  <BadgeCheck className="size-3.5" />
                  {entry.verified ? "Remove verified" : "Verify"}
                </Button>
              </form>
            )}
            {canWrite && <EditVolunteerDialog entry={entry} />}
            {canDelete && (
              <form action={deleteVolunteer}>
                <input type="hidden" name="id" value={entry.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VolunteersManager({
  organizationId,
  entries,
  members,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  entries: VolunteerRow[];
  members: MemberBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const teams = new Map<string, VolunteerRow[]>();
  for (const entry of entries) {
    const key = entry.team?.trim() || NO_TEAM;
    teams.set(key, [...(teams.get(key) ?? []), entry]);
  }
  const volunteerIds = new Set(entries.map((e) => e.member_id));
  // A member can be a volunteer only once.
  const candidates = members.filter((m) => !volunteerIds.has(m.id));

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <AddVolunteerDialog organizationId={organizationId} members={candidates} />
        </div>
      )}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <HandHelping className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No volunteers yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{canWrite ? 'Click "Add volunteer" to add your first one.' : "Check back once someone is added."}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...teams.entries()].map(([team, group]) => (
            <div key={team} className="space-y-3">
              <div className="flex items-center gap-2">
                <HandHelping className="size-4 text-primary" />
                <h2 className="font-heading text-lg font-bold">{team}</h2>
                <Badge variant="secondary">{group.length}</Badge>
              </div>
              <div className="space-y-4">
                {group.map((entry) => (
                  <VolunteerCard key={entry.id} entry={entry} canWrite={canWrite} canDelete={canDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
