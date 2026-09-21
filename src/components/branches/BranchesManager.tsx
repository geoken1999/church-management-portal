"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, MapPin, Users, UserRound, Phone, Globe } from "lucide-react";
import {
  createBranch,
  updateBranch,
  deleteBranch,
  type BranchFormState,
} from "@/lib/branches/actions";
import type { Branch, Member } from "@/types/database";
import { getCountryOptions, countryName } from "@/lib/phone/countries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Leaders picker options — just what the Select needs (matches
// getLeaderMembers()'s shape).
type LeaderOption = Pick<Member, "id" | "first_name" | "last_name">;
// The branch's own embedded manager (via getBranches()'s join), which
// includes phone for the read-only card display.
type ManagedMember = Pick<Member, "id" | "first_name" | "last_name" | "phone">;
type BranchRow = Branch & { members: ManagedMember | null };

const initialState: BranchFormState = {};

function personName(member: LeaderOption | ManagedMember | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

function BranchFields({
  branch,
  members,
  managedBy,
  onManagedByChange,
  errors,
}: {
  branch?: Branch;
  members: LeaderOption[];
  managedBy: string;
  onManagedByChange: (value: string) => void;
  errors?: BranchFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Branch name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={branch?.name}
          placeholder="Downtown Campus"
          required
          aria-invalid={Boolean(errors?.name)}
          aria-describedby={errors?.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={branch?.location ?? ""}
          placeholder="123 Main St, Springfield"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="memberCount">Number of members</Label>
        <Input
          id="memberCount"
          name="memberCount"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={branch?.member_count ?? undefined}
          placeholder="e.g. 120"
          aria-invalid={Boolean(errors?.memberCount)}
          aria-describedby={errors?.memberCount ? "memberCount-error" : undefined}
        />
        <FieldError id="memberCount-error" message={errors?.memberCount} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="managedBy">Branch manager</Label>
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
        <p className="text-xs text-muted-foreground">
          Picked from{" "}
          <a href="/dashboard/leaders" className="underline">
            Leaders
          </a>
          . Add someone there first if they&apos;re not listed.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Select name="country" defaultValue={branch?.country ?? undefined}>
          <SelectTrigger id="country" className="w-full">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {getCountryOptions().map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.name} (+{option.callingCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Used to interpret member phone numbers for this branch when sending SMS.</p>
      </div>
    </div>
  );
}

function AddBranchDialog({ organizationId, members }: { organizationId: string; members: LeaderOption[] }) {
  const [state, setState] = useState<BranchFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createBranch(state, formData);
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
            Add branch
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a branch</DialogTitle>
          <DialogDescription>Add a new campus or location for your church.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="managedBy" value={managedBy} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <BranchFields members={members} managedBy={managedBy} onManagedByChange={setManagedBy} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditBranchDialog({ branch, members }: { branch: Branch; members: LeaderOption[] }) {
  const [state, setState] = useState<BranchFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState(branch.managed_by ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateBranch(state, formData);
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
          setManagedBy(branch.managed_by ?? "");
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
          <DialogTitle>Edit branch</DialogTitle>
          <DialogDescription>Update this branch&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />
          <input type="hidden" name="managedBy" value={managedBy} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <BranchFields branch={branch} members={members} managedBy={managedBy} onManagedByChange={setManagedBy} errors={state.fieldErrors} />
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

function BranchCard({ branch, members, canManage }: { branch: BranchRow; members: LeaderOption[]; canManage: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-heading text-base font-bold">{branch.name}</h3>
          {canManage && (
            <div className="flex items-center gap-1">
              <EditBranchDialog branch={branch} members={members} />
              <form action={deleteBranch}>
                <input type="hidden" name="branchId" value={branch.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            <dd>{branch.location ?? "No location set"}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4 shrink-0" />
            <dd>
              {branch.member_count != null ? `${branch.member_count} members` : "Member count not set"}
            </dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="size-4 shrink-0" />
            <dd>{personName(branch.members)}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="size-4 shrink-0" />
            <dd>{branch.members?.phone ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="size-4 shrink-0" />
            <dd>{countryName(branch.country) ?? "No country set"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function BranchesManager({
  organizationId,
  branches,
  members,
  canManage,
}: {
  organizationId: string;
  branches: BranchRow[];
  members: LeaderOption[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddBranchDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {branches.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No branches yet. {canManage && 'Click "Add branch" to add your first location.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} members={members} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
