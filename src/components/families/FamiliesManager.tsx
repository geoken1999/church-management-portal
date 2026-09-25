"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, UserPlus, StickyNote, House, ChevronDown } from "lucide-react";
import {
  createFamily,
  updateFamily,
  deleteFamily,
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  type FamilyFormState,
  type FamilyMemberFormState,
} from "@/lib/families/actions";
import type { Family, FamilyMember, Member } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name" | "phone">;
type FamilyMemberRow = FamilyMember & { members: MemberBasic | null };
type FamilyRow = Family & { members: FamilyMemberRow[] };

const familyInitialState: FamilyFormState = {};
const memberInitialState: FamilyMemberFormState = {};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

// ---------------------------------------------------------------------------
// Family create/edit — step one of the flow: name the family before
// assigning anyone to it.
// ---------------------------------------------------------------------------

function FamilyFields({ family, errors }: { family?: Family; errors?: FamilyFormState["fieldErrors"] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Family name</Label>
        <Input id="name" name="name" defaultValue={family?.name} placeholder="The Smith Family" required aria-invalid={Boolean(errors?.name)} />
        <FieldError id="name-error" message={errors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={family?.notes ?? ""} placeholder="Address, household notes..." rows={2} />
      </div>
    </div>
  );
}

function CreateFamilyDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<FamilyFormState>(familyInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createFamily(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(familyInitialState);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Create family
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a family</DialogTitle>
          <DialogDescription>Give it a name — you&apos;ll add members next.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FamilyFields errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create family"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFamilyDialog({ family }: { family: Family }) {
  const [state, setState] = useState<FamilyFormState>(familyInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFamily(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(familyInitialState);
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
          <DialogTitle>Edit family</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={family.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FamilyFields family={family} errors={state.fieldErrors} />
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

// ---------------------------------------------------------------------------
// Family member add/edit — step two: assign an existing congregant to the
// family and record their relationship within it.
// ---------------------------------------------------------------------------

function FamilyMemberFields({
  entry,
  members,
  memberId,
  onMemberChange,
  errors,
}: {
  entry?: FamilyMember;
  members: MemberBasic[];
  memberId: string;
  onMemberChange: (value: string) => void;
  errors?: FamilyMemberFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="memberId">
          Member<span className="text-destructive">*</span>
        </Label>
        <Select value={memberId} onValueChange={(v) => onMemberChange(v ?? "")}>
          <SelectTrigger id="memberId" className="w-full" aria-invalid={Boolean(errors?.memberId)}>
            <SelectValue placeholder="Select a member">
              {(v: string | null) => personName(members.find((m) => m.id === v) ?? null)}
            </SelectValue>
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
      <div className="space-y-2">
        <Label htmlFor="relationship">Relationship</Label>
        <Input
          id="relationship"
          name="relationship"
          defaultValue={entry?.relationship}
          placeholder="Head of household, Spouse, Child, Guardian..."
          required
          aria-invalid={Boolean(errors?.relationship)}
        />
        <FieldError id="relationship-error" message={errors?.relationship} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="memberNotes">Notes</Label>
        <Textarea id="memberNotes" name="notes" defaultValue={entry?.notes ?? ""} placeholder="Optional notes" rows={2} />
      </div>
    </div>
  );
}

function AddFamilyMemberDialog({ familyId, members }: { familyId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<FamilyMemberFormState>(memberInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await addFamilyMember(state, formData);
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
          setState(memberInitialState);
          setMemberId("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <UserPlus className="size-3.5" />
            Add member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a family member</DialogTitle>
          <DialogDescription>Pick an existing congregant and their relationship within this family.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="memberId" value={memberId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FamilyMemberFields members={members} memberId={memberId} onMemberChange={setMemberId} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFamilyMemberDialog({ entry, members }: { entry: FamilyMember; members: MemberBasic[] }) {
  const [state, setState] = useState<FamilyMemberFormState>(memberInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(entry.member_id);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFamilyMember(state, formData);
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
          setState(memberInitialState);
          setMemberId(entry.member_id);
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
          <DialogTitle>Edit family member</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="memberId" value={memberId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FamilyMemberFields entry={entry} members={members} memberId={memberId} onMemberChange={setMemberId} errors={state.fieldErrors} />
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

// ---------------------------------------------------------------------------

function FamilyCard({
  family,
  members,
  canWrite,
  canDelete,
}: {
  family: FamilyRow;
  members: MemberBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          <House className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <CardTitle className="font-heading text-lg">{family.name}</CardTitle>
            {family.notes && <p className="mt-1 text-sm text-muted-foreground">{family.notes}</p>}
          </div>
          <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {(canWrite || canDelete) && (
          <div className="flex shrink-0 items-center gap-1">
            {canWrite && <EditFamilyDialog family={family} />}
            {canDelete && (
              <form action={deleteFamily}>
                <input type="hidden" name="id" value={family.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        )}
      </CardHeader>
      {!expanded ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {family.members.length} {family.members.length === 1 ? "member" : "members"}
          </p>
        </CardContent>
      ) : (
        <CardContent className="space-y-3">
          {family.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {family.members.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{personName(entry.members)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{entry.relationship}</Badge>
                        {entry.members?.phone && <span className="text-xs text-muted-foreground">{entry.members.phone}</span>}
                      </div>
                      {entry.notes && (
                        <p className="flex items-start gap-1 text-xs text-muted-foreground">
                          <StickyNote className="mt-0.5 size-3 shrink-0" />
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  {(canWrite || canDelete) && (
                    <div className="flex shrink-0 items-center gap-1">
                      {canWrite && <EditFamilyMemberDialog entry={entry} members={members} />}
                      {canDelete && (
                        <form action={removeFamilyMember}>
                          <input type="hidden" name="id" value={entry.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Trash2 className="size-3.5" />
                            Remove
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {canWrite && <AddFamilyMemberDialog familyId={family.id} members={members} />}
        </CardContent>
      )}
    </Card>
  );
}

export function FamiliesManager({
  organizationId,
  families,
  members,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  families: FamilyRow[];
  members: MemberBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <CreateFamilyDialog organizationId={organizationId} />
        </div>
      )}

      {families.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <House className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No families yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Create family" to start grouping your first household, then add members to it.' : "Check back once a family has been created."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {families.map((family) => (
            <FamilyCard key={family.id} family={family} members={members} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
