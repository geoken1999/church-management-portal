"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, StickyNote, Crown } from "lucide-react";
import {
  createLeader,
  updateLeader,
  deleteLeader,
  type LeaderFormState,
} from "@/lib/leaders/actions";
import type { Leader, Member } from "@/types/database";
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
type LeaderRow = Leader & { members: MemberBasic | null };

const initialState: LeaderFormState = {};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

function MemberSelectField({
  members,
  value,
  onChange,
  error,
}: {
  members: MemberBasic[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="memberId">
        Member<span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id="memberId" className="w-full" aria-invalid={Boolean(error)}>
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
      <FieldError id="memberId-error" message={error} />
    </div>
  );
}

function AddLeaderDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<LeaderFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createLeader(state, formData);
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
            Add leader
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a leader</DialogTitle>
          <DialogDescription>
            Designate a member as a leader — they&apos;ll be selectable as a manager for ministries, branches, and
            events.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="memberId" value={memberId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <MemberSelectField members={members} value={memberId} onChange={setMemberId} error={state.fieldErrors?.memberId} />
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" name="title" placeholder="Senior Pastor, Elder, Deacon..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Optional notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add leader"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLeaderDialog({ leader }: { leader: LeaderRow }) {
  const [state, setState] = useState<LeaderFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateLeader(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(initialState);
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
          <DialogTitle>Edit leader</DialogTitle>
          <DialogDescription>Update {personName(leader.members)}&apos;s title or notes.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="leaderId" value={leader.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" name="title" defaultValue={leader.title ?? ""} placeholder="Senior Pastor, Elder, Deacon..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={leader.notes ?? ""} placeholder="Optional notes" rows={2} />
          </div>
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

function LeaderCard({ leader, canManage }: { leader: LeaderRow; canManage: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{personName(leader.members)}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {leader.title && <Badge variant="secondary">{leader.title}</Badge>}
            {leader.members?.phone && <span className="text-sm text-muted-foreground">{leader.members.phone}</span>}
          </div>
          {leader.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {leader.notes}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <EditLeaderDialog leader={leader} />
            <form action={deleteLeader}>
              <input type="hidden" name="leaderId" value={leader.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeadersManager({
  organizationId,
  leaders,
  members,
  canManage,
}: {
  organizationId: string;
  leaders: LeaderRow[];
  members: MemberBasic[];
  canManage: boolean;
}) {
  const leaderMemberIds = new Set(leaders.map((l) => l.member_id));
  const availableMembers = members.filter((m) => !leaderMemberIds.has(m.id));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddLeaderDialog organizationId={organizationId} members={availableMembers} />
        </div>
      )}

      {leaders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Crown className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No leaders yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Leaders can be assigned to manage ministries, branches, and events.{" "}
                {canManage && 'Click "Add leader" to designate your first one.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {leaders.map((leader) => (
            <LeaderCard key={leader.id} leader={leader} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
