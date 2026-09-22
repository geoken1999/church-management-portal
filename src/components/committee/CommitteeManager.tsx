"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, StickyNote, Users2 } from "lucide-react";
import {
  createCommitteeMember,
  updateCommitteeMember,
  deleteCommitteeMember,
  type CommitteeMemberFormState,
} from "@/lib/committee/actions";
import type { CommitteeMember, Member } from "@/types/database";
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

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name" | "phone">;
type CommitteeMemberRow = CommitteeMember & { members: MemberBasic | null };

const initialState: CommitteeMemberFormState = {};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

type FieldErrorsProp = CommitteeMemberFormState["fieldErrors"];

function CommitteeFields({
  entry,
  members,
  memberId,
  onMemberChange,
  errors,
}: {
  entry?: CommitteeMember;
  members: MemberBasic[];
  memberId: string;
  onMemberChange: (value: string) => void;
  errors?: FieldErrorsProp;
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
        <Label htmlFor="committeeName">Committee name</Label>
        <Input
          id="committeeName"
          name="committeeName"
          defaultValue={entry?.committee_name}
          placeholder="Finance Committee, Building Committee..."
          required
          aria-invalid={Boolean(errors?.committeeName)}
        />
        <FieldError id="committeeName-error" message={errors?.committeeName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          name="role"
          defaultValue={entry?.role}
          placeholder="Chairperson, Secretary, Treasurer, Member..."
          required
          aria-invalid={Boolean(errors?.role)}
        />
        <FieldError id="role-error" message={errors?.role} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} placeholder="Optional notes" rows={2} />
      </div>
    </div>
  );
}

function AddCommitteeMemberDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<CommitteeMemberFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createCommitteeMember(state, formData);
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
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add committee member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a committee member</DialogTitle>
          <DialogDescription>Assign a member to a committee and their role on it.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="memberId" value={memberId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <CommitteeFields members={members} memberId={memberId} onMemberChange={setMemberId} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add committee member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCommitteeMemberDialog({ entry, members }: { entry: CommitteeMember; members: MemberBasic[] }) {
  const [state, setState] = useState<CommitteeMemberFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(entry.member_id);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateCommitteeMember(state, formData);
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
          <DialogTitle>Edit committee member</DialogTitle>
          <DialogDescription>Update this committee assignment.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="memberId" value={memberId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <CommitteeFields entry={entry} members={members} memberId={memberId} onMemberChange={setMemberId} errors={state.fieldErrors} />
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

function CommitteeMemberCard({
  entry,
  members,
  canWrite,
  canDelete,
}: {
  entry: CommitteeMemberRow;
  members: MemberBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{personName(entry.members)}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{entry.role}</Badge>
            {entry.members?.phone && <span className="text-sm text-muted-foreground">{entry.members.phone}</span>}
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
            {canWrite && <EditCommitteeMemberDialog entry={entry} members={members} />}
            {canDelete && (
              <form action={deleteCommitteeMember}>
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

export function CommitteeManager({
  organizationId,
  entries,
  members,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  entries: CommitteeMemberRow[];
  members: MemberBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const committees = new Map<string, CommitteeMemberRow[]>();
  for (const entry of entries) {
    const group = committees.get(entry.committee_name) ?? [];
    group.push(entry);
    committees.set(entry.committee_name, group);
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <AddCommitteeMemberDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users2 className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No committee members yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Add committee member" to assign your first one.' : "Check back once someone is assigned."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...committees.entries()].map(([committeeName, group]) => (
            <div key={committeeName} className="space-y-3">
              <div className="flex items-center gap-2">
                <Users2 className="size-4 text-primary" />
                <h2 className="font-heading text-lg font-bold">{committeeName}</h2>
                <Badge variant="secondary">{group.length}</Badge>
              </div>
              <div className="space-y-4">
                {group.map((entry) => (
                  <CommitteeMemberCard key={entry.id} entry={entry} members={members} canWrite={canWrite} canDelete={canDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
