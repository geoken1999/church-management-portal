"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, HandCoins, MapPin, CalendarDays } from "lucide-react";
import { createOffering, updateOffering, deleteOffering, type OfferingFormState } from "@/lib/finance/actions";
import type { Branch, Offering } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type BranchBasic = Pick<Branch, "id" | "name">;
type OfferingRow = Offering & { branches: BranchBasic | null };

const initialState: OfferingFormState = {};

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type FieldErrorsProp = OfferingFormState["fieldErrors"];

function OfferingFields({
  offering,
  branches,
  branchId,
  onBranchChange,
  errors,
}: {
  offering?: Offering;
  branches: BranchBasic[];
  branchId: string;
  onBranchChange: (value: string) => void;
  errors?: FieldErrorsProp;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Input
          id="category"
          name="category"
          defaultValue={offering?.category}
          placeholder="Sunday Service, Tithe, Building Fund..."
          required
          aria-invalid={Boolean(errors?.category)}
        />
        <FieldError id="category-error" message={errors?.category} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={offering?.amount ?? ""}
            aria-invalid={Boolean(errors?.amount)}
          />
          <FieldError id="amount-error" message={errors?.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collectedOn">Date collected</Label>
          <Input
            id="collectedOn"
            name="collectedOn"
            type="date"
            defaultValue={offering?.collected_on ?? ""}
            aria-invalid={Boolean(errors?.collectedOn)}
          />
          <FieldError id="collectedOn-error" message={errors?.collectedOn} />
        </div>
      </div>
      {branches.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="branchId">Branch (optional)</Label>
          <Select value={branchId} onValueChange={(v) => onBranchChange(v ?? "")}>
            <SelectTrigger id="branchId" className="w-full">
              <SelectValue placeholder="No branch">
                {(v: string | null) => branches.find((b) => b.id === v)?.name ?? "No branch"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No branch</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={offering?.notes ?? ""} rows={2} />
      </div>
    </div>
  );
}

function AddOfferingDialog({ organizationId, branches }: { organizationId: string; branches: BranchBasic[] }) {
  const [state, setState] = useState<OfferingFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createOffering(state, formData);
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
          setBranchId("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Record offering
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an offering</DialogTitle>
          <DialogDescription>Log an amount collected during a service or event.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <OfferingFields branches={branches} branchId={branchId} onBranchChange={setBranchId} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record offering"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditOfferingDialog({ offering, branches }: { offering: Offering; branches: BranchBasic[] }) {
  const [state, setState] = useState<OfferingFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(offering.branch_id ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateOffering(state, formData);
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
          setBranchId(offering.branch_id ?? "");
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
          <DialogTitle>Edit offering</DialogTitle>
          <DialogDescription>Update this record.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={offering.id} />
          <input type="hidden" name="branchId" value={branchId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <OfferingFields offering={offering} branches={branches} branchId={branchId} onBranchChange={setBranchId} errors={state.fieldErrors} />
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

function OfferingCard({
  offering,
  branches,
  canWrite,
  canDelete,
}: {
  offering: OfferingRow;
  branches: BranchBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <h3 className="font-heading text-base font-bold">{formatMoney(offering.amount)}</h3>
            <span className="text-sm text-muted-foreground">{offering.category}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(offering.collected_on)}
            </span>
            {offering.branches && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {offering.branches.name}
              </span>
            )}
          </div>
          {offering.notes && <p className="text-sm text-muted-foreground">{offering.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canWrite && <EditOfferingDialog offering={offering} branches={branches} />}
          {canDelete && (
            <form action={deleteOffering}>
              <input type="hidden" name="id" value={offering.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OfferingsManager({
  organizationId,
  offerings,
  branches,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  offerings: OfferingRow[];
  branches: BranchBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const total = offerings.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {offerings.length} {offerings.length === 1 ? "record" : "records"} — {formatMoney(total)} total
        </p>
        {canWrite && <AddOfferingDialog organizationId={organizationId} branches={branches} />}
      </div>

      {offerings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <HandCoins className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No offerings recorded yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Record offering" to log your first one.' : "Check back once a record is logged."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {offerings.map((offering) => (
            <OfferingCard key={offering.id} offering={offering} branches={branches} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
