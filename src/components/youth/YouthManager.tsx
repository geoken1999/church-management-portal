"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, StickyNote, GraduationCap, Phone, Cake } from "lucide-react";
import {
  createYouth,
  updateYouth,
  deleteYouth,
  type YouthFormState,
} from "@/lib/youth/actions";
import type { Member, Youth } from "@/types/database";
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

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name" | "phone" | "date_of_birth">;
type YouthRow = Youth & { members: MemberBasic | null };

const initialState: YouthFormState = {};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unknown member";
}

function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const dob = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
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

function AddYouthDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<YouthFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createYouth(state, formData);
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
            Add youth
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a youth</DialogTitle>
          <DialogDescription>Add a member to the youth roster.</DialogDescription>
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
            <Label htmlFor="grade">Grade / school (optional)</Label>
            <Input id="grade" name="grade" placeholder="10th Grade" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianName">Parent / guardian name</Label>
            <Input id="guardianName" name="guardianName" placeholder="Jane Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianPhone">Parent / guardian phone</Label>
            <Input id="guardianPhone" name="guardianPhone" type="tel" placeholder="+1 555 000 1234" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Optional notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add youth"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditYouthDialog({ youth }: { youth: YouthRow }) {
  const [state, setState] = useState<YouthFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateYouth(state, formData);
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
          <DialogTitle>Edit youth</DialogTitle>
          <DialogDescription>Update {personName(youth.members)}&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="youthId" value={youth.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="grade">Grade / school (optional)</Label>
            <Input id="grade" name="grade" defaultValue={youth.grade ?? ""} placeholder="10th Grade" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianName">Parent / guardian name</Label>
            <Input id="guardianName" name="guardianName" defaultValue={youth.guardian_name ?? ""} placeholder="Jane Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianPhone">Parent / guardian phone</Label>
            <Input
              id="guardianPhone"
              name="guardianPhone"
              type="tel"
              defaultValue={youth.guardian_phone ?? ""}
              placeholder="+1 555 000 1234"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={youth.notes ?? ""} placeholder="Optional notes" rows={2} />
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

function YouthCard({ youth, canManage }: { youth: YouthRow; canManage: boolean }) {
  const age = calculateAge(youth.members?.date_of_birth ?? null);

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{personName(youth.members)}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {age != null && (
              <Badge variant="secondary">
                <Cake className="size-3" />
                {age} years old
              </Badge>
            )}
            {youth.grade && (
              <Badge variant="outline">
                <GraduationCap className="size-3" />
                {youth.grade}
              </Badge>
            )}
          </div>
          {(youth.guardian_name || youth.guardian_phone) && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5 shrink-0" />
              {youth.guardian_name ?? "Guardian"}
              {youth.guardian_phone ? ` · ${youth.guardian_phone}` : ""}
            </p>
          )}
          {youth.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {youth.notes}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <EditYouthDialog youth={youth} />
            <form action={deleteYouth}>
              <input type="hidden" name="youthId" value={youth.id} />
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

export function YouthManager({
  organizationId,
  youths,
  members,
  canManage,
}: {
  organizationId: string;
  youths: YouthRow[];
  members: MemberBasic[];
  canManage: boolean;
}) {
  const youthMemberIds = new Set(youths.map((y) => y.member_id));
  const availableMembers = members.filter((m) => !youthMemberIds.has(m.id));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddYouthDialog organizationId={organizationId} members={availableMembers} />
        </div>
      )}

      {youths.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <GraduationCap className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No youth yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Track members of your youth ministry here.{" "}
                {canManage && 'Click "Add youth" to add your first one.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {youths.map((youth) => (
            <YouthCard key={youth.id} youth={youth} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
