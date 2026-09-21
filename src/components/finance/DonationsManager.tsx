"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Gift, UserRound, CalendarDays, Target } from "lucide-react";
import { createDonation, updateDonation, deleteDonation, type DonationFormState } from "@/lib/finance/actions";
import { DONATION_METHODS, DONATION_METHOD_LABELS } from "@/lib/finance/validation";
import type { Donation, DonationMethod, Member } from "@/types/database";
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
type FundraiserOption = { id: string; title: string };
type DonationRow = Donation & { members: MemberBasic | null; fundraisers: FundraiserOption | null };

const initialState: DonationFormState = {};

function donorName(donation: { members: MemberBasic | null; donor_name: string | null }): string {
  if (donation.members) return `${donation.members.first_name} ${donation.members.last_name}`;
  return donation.donor_name ?? "Anonymous";
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type FieldErrorsProp = DonationFormState["fieldErrors"];

function DonationFields({
  donation,
  members,
  fundraisers,
  memberId,
  onMemberChange,
  donorNameValue,
  onDonorNameChange,
  method,
  onMethodChange,
  fundraiserId,
  onFundraiserChange,
  errors,
}: {
  donation?: Donation;
  members: MemberBasic[];
  fundraisers: FundraiserOption[];
  memberId: string;
  onMemberChange: (value: string) => void;
  donorNameValue: string;
  onDonorNameChange: (value: string) => void;
  method: DonationMethod;
  onMethodChange: (value: DonationMethod) => void;
  fundraiserId: string;
  onFundraiserChange: (value: string) => void;
  errors?: FieldErrorsProp;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="memberId">Member (optional)</Label>
        <Select value={memberId} onValueChange={(v) => onMemberChange(v ?? "")}>
          <SelectTrigger id="memberId" className="w-full">
            <SelectValue placeholder="Not a member">
              {(v: string | null) => {
                const member = members.find((m) => m.id === v);
                return member ? `${member.first_name} ${member.last_name}` : "Not a member";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Not a member</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!memberId && (
        <div className="space-y-2">
          <Label htmlFor="donorName">Donor name</Label>
          <Input
            id="donorName"
            name="donorName"
            value={donorNameValue}
            onChange={(e) => onDonorNameChange(e.target.value)}
            placeholder="Guest or outside donor's name"
            aria-invalid={Boolean(errors?.donor)}
          />
          <FieldError id="donorName-error" message={errors?.donor} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={donation?.amount ?? ""}
            aria-invalid={Boolean(errors?.amount)}
          />
          <FieldError id="amount-error" message={errors?.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="donatedOn">Date</Label>
          <Input
            id="donatedOn"
            name="donatedOn"
            type="date"
            defaultValue={donation?.donated_on ?? ""}
            aria-invalid={Boolean(errors?.donatedOn)}
          />
          <FieldError id="donatedOn-error" message={errors?.donatedOn} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="method">Method</Label>
        <Select value={method} onValueChange={(v) => onMethodChange((v ?? "cash") as DonationMethod)}>
          <SelectTrigger id="method" className="w-full">
            <SelectValue>{(v: string | null) => DONATION_METHOD_LABELS[(v ?? "cash") as DonationMethod]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DONATION_METHODS.map((value) => (
              <SelectItem key={value} value={value}>
                {DONATION_METHOD_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {fundraisers.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="fundraiserId">Fundraiser (optional)</Label>
          <Select value={fundraiserId} onValueChange={(v) => onFundraiserChange(v ?? "")}>
            <SelectTrigger id="fundraiserId" className="w-full">
              <SelectValue placeholder="Not linked to a campaign">
                {(v: string | null) => fundraisers.find((f) => f.id === v)?.title ?? "Not linked to a campaign"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Not linked to a campaign</SelectItem>
              {fundraisers.map((fundraiser) => (
                <SelectItem key={fundraiser.id} value={fundraiser.id}>
                  {fundraiser.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={donation?.notes ?? ""} rows={2} />
      </div>
    </div>
  );
}

function AddDonationDialog({
  organizationId,
  members,
  fundraisers,
}: {
  organizationId: string;
  members: MemberBasic[];
  fundraisers: FundraiserOption[];
}) {
  const [state, setState] = useState<DonationFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [donorNameValue, setDonorNameValue] = useState("");
  const [method, setMethod] = useState<DonationMethod>("cash");
  const [fundraiserId, setFundraiserId] = useState("");

  function reset() {
    setState(initialState);
    setMemberId("");
    setDonorNameValue("");
    setMethod("cash");
    setFundraiserId("");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createDonation(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Record donation
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a donation</DialogTitle>
          <DialogDescription>Log a gift from a member, or a guest/outside donor.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="fundraiserId" value={fundraiserId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <DonationFields
            members={members}
            fundraisers={fundraisers}
            memberId={memberId}
            onMemberChange={setMemberId}
            donorNameValue={donorNameValue}
            onDonorNameChange={setDonorNameValue}
            method={method}
            onMethodChange={setMethod}
            fundraiserId={fundraiserId}
            onFundraiserChange={setFundraiserId}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record donation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDonationDialog({
  donation,
  members,
  fundraisers,
}: {
  donation: Donation;
  members: MemberBasic[];
  fundraisers: FundraiserOption[];
}) {
  const [state, setState] = useState<DonationFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(donation.member_id ?? "");
  const [donorNameValue, setDonorNameValue] = useState(donation.donor_name ?? "");
  const [method, setMethod] = useState<DonationMethod>(donation.method);
  const [fundraiserId, setFundraiserId] = useState(donation.fundraiser_id ?? "");

  function reset() {
    setState(initialState);
    setMemberId(donation.member_id ?? "");
    setDonorNameValue(donation.donor_name ?? "");
    setMethod(donation.method);
    setFundraiserId(donation.fundraiser_id ?? "");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateDonation(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit donation</DialogTitle>
          <DialogDescription>Update this record.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={donation.id} />
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="fundraiserId" value={fundraiserId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <DonationFields
            donation={donation}
            members={members}
            fundraisers={fundraisers}
            memberId={memberId}
            onMemberChange={setMemberId}
            donorNameValue={donorNameValue}
            onDonorNameChange={setDonorNameValue}
            method={method}
            onMethodChange={setMethod}
            fundraiserId={fundraiserId}
            onFundraiserChange={setFundraiserId}
            errors={state.fieldErrors}
          />
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

function DonationCard({
  donation,
  members,
  fundraisers,
  canWrite,
  canDelete,
}: {
  donation: DonationRow;
  members: MemberBasic[];
  fundraisers: FundraiserOption[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-heading text-base font-bold">{formatMoney(donation.amount)}</h3>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <UserRound className="size-3.5" />
              {donorName(donation)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(donation.donated_on)}
            </span>
            <Badge variant="secondary">{DONATION_METHOD_LABELS[donation.method]}</Badge>
            {donation.fundraisers && (
              <span className="flex items-center gap-1">
                <Target className="size-3.5" />
                {donation.fundraisers.title}
              </span>
            )}
          </div>
          {donation.notes && <p className="text-sm text-muted-foreground">{donation.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canWrite && <EditDonationDialog donation={donation} members={members} fundraisers={fundraisers} />}
          {canDelete && (
            <form action={deleteDonation}>
              <input type="hidden" name="id" value={donation.id} />
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

export function DonationsManager({
  organizationId,
  donations,
  members,
  fundraisers,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  donations: DonationRow[];
  members: MemberBasic[];
  fundraisers: FundraiserOption[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const total = donations.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {donations.length} {donations.length === 1 ? "record" : "records"} — {formatMoney(total)} total
        </p>
        {canWrite && <AddDonationDialog organizationId={organizationId} members={members} fundraisers={fundraisers} />}
      </div>

      {donations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Gift className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No donations recorded yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Record donation" to log your first one.' : "Check back once a record is logged."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              members={members}
              fundraisers={fundraisers}
              canWrite={canWrite}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
