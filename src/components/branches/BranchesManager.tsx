"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, MapPin, Users, UserRound, Phone } from "lucide-react";
import {
  createBranch,
  updateBranch,
  deleteBranch,
  type BranchFormState,
} from "@/lib/branches/actions";
import type { Branch } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: BranchFormState = {};

function BranchFields({
  branch,
  errors,
}: {
  branch?: Branch;
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
        <Label htmlFor="leaderName">Pastor / leader name</Label>
        <Input
          id="leaderName"
          name="leaderName"
          defaultValue={branch?.leader_name ?? ""}
          placeholder="Rev. Jane Doe"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="leaderPhone">Leader phone</Label>
        <Input
          id="leaderPhone"
          name="leaderPhone"
          type="tel"
          defaultValue={branch?.leader_phone ?? ""}
          placeholder="+1 555 000 1234"
          aria-invalid={Boolean(errors?.leaderPhone)}
          aria-describedby={errors?.leaderPhone ? "leaderPhone-error" : undefined}
        />
        <FieldError id="leaderPhone-error" message={errors?.leaderPhone} />
      </div>
    </div>
  );
}

function AddBranchDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<BranchFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

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
        if (next) setState(initialState);
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
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <BranchFields errors={state.fieldErrors} />
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

function EditBranchDialog({ branch }: { branch: Branch }) {
  const [state, setState] = useState<BranchFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

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
          <DialogTitle>Edit branch</DialogTitle>
          <DialogDescription>Update this branch&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <BranchFields branch={branch} errors={state.fieldErrors} />
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

function BranchCard({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-heading text-base font-bold">{branch.name}</h3>
          {canManage && (
            <div className="flex items-center gap-1">
              <EditBranchDialog branch={branch} />
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
            <dd>{branch.leader_name ?? "No leader assigned"}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="size-4 shrink-0" />
            <dd>{branch.leader_phone ?? "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function BranchesManager({
  organizationId,
  branches,
  canManage,
}: {
  organizationId: string;
  branches: Branch[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddBranchDialog organizationId={organizationId} />
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
            <BranchCard key={branch.id} branch={branch} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
