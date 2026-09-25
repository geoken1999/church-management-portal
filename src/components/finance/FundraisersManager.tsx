"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Target, UserRound, MapPin, CalendarDays, Link2, Landmark, Wallet } from "lucide-react";
import {
  createFundraiser,
  updateFundraiser,
  deleteFundraiser,
  saveOwnRazorpayAccount,
  removeOwnRazorpayAccount,
  updateFundraiserPaymentSettings,
  requestFundraiserPayout,
  cancelFundraiserPayoutRequest,
  type FundraiserFormState,
  type RazorpayAccountState,
  type FundraiserPaymentSettingsState,
  type PayoutRequestState,
} from "@/lib/finance/actions";
import { FUNDRAISER_STATUSES } from "@/lib/finance/validation";
import { SHARED_SERVICE_FEE_RATE, sharedServiceFee, sharedServiceNetAmount } from "@/lib/finance/fees";
import type { Branch, Fundraiser, FundraiserPaymentMode, FundraiserStatus, Member } from "@/types/database";

const SHARED_SERVICE_FEE_PERCENT = `${(SHARED_SERVICE_FEE_RATE * 100).toString()}%`;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
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
type BranchBasic = Pick<Branch, "id" | "name">;
type FundraiserRow = Fundraiser & {
  raisedAmount: number;
  sharedCollected: number;
  sharedOwed: number;
  pendingPayoutRequest: { id: string; amount: number } | null;
  branches: BranchBasic | null;
  members: MemberBasic | null;
};

const initialState: FundraiserFormState = {};

const STATUS_LABELS: Record<FundraiserStatus, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANTS: Record<FundraiserStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CopyLinkRow({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Input readOnly value={link} className="h-8 text-xs" onFocus={(event) => event.target.select()} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

const razorpayAccountInitialState: RazorpayAccountState = {};

function RazorpayAccountCard({ organizationId, connected }: { organizationId: string; connected: boolean }) {
  const [state, setState] = useState<RazorpayAccountState>(razorpayAccountInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveOwnRazorpayAccount(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Landmark className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold">Your Razorpay account</h3>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? "Connected — fundraisers set to \"Own account\" pay out straight to you."
                  : "Connect your own Razorpay account to receive giving-link payments directly."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!open && (
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                {connected ? "Update" : "Connect"}
              </Button>
            )}
            {connected && !open && (
              <form action={removeOwnRazorpayAccount}>
                <input type="hidden" name="organizationId" value={organizationId} />
                <Button type="submit" size="sm" variant="ghost">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
        </div>

        {open && (
          <form action={handleSubmit} className="space-y-3 border-t border-border pt-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="keyId" className="text-xs">
                  Key ID
                </Label>
                <Input id="keyId" name="keyId" placeholder="rzp_live_xxxxxxxx" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keySecret" className="text-xs">
                  Key Secret
                </Label>
                <Input id="keySecret" name="keySecret" type="password" placeholder="••••••••••••" required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Found under Settings → API Keys in your Razorpay Dashboard. Stored securely — never shown again after saving.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

const paymentSettingsInitialState: FundraiserPaymentSettingsState = {};

function GivingLinkSettings({
  fundraiser,
  siteUrl,
  hasOwnAccount,
  canWrite,
}: {
  fundraiser: Fundraiser;
  siteUrl: string;
  hasOwnAccount: boolean;
  canWrite: boolean;
}) {
  const [state, setState] = useState<FundraiserPaymentSettingsState>(paymentSettingsInitialState);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<FundraiserPaymentMode | "none">(fundraiser.payment_mode ?? "none");
  const [enabled, setEnabled] = useState(fundraiser.payment_link_enabled);
  const link = `${siteUrl}/give/${fundraiser.share_token}`;

  function save(nextMode: FundraiserPaymentMode | "none", nextEnabled: boolean) {
    setState(paymentSettingsInitialState);
    const formData = new FormData();
    formData.set("fundraiserId", fundraiser.id);
    formData.set("paymentMode", nextMode);
    if (nextEnabled) formData.set("enabled", "on");
    startTransition(async () => {
      const result = await updateFundraiserPaymentSettings(state, formData);
      if (result.error) {
        setState(result);
        return;
      }
      setMode(nextMode);
      setEnabled(nextEnabled && nextMode !== "none");
    });
  }

  if (!canWrite) {
    return enabled && mode !== "none" ? (
      <div className="flex items-center gap-1.5 text-xs text-primary">
        <Link2 className="size-3.5" />
        Giving link enabled
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Link2 className="size-3.5" />
          Giving link
        </Label>
        <Select value={mode} onValueChange={(value) => save((value ?? "none") as FundraiserPaymentMode | "none", enabled)}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue>
              {(value: string | null) =>
                value === "own" ? "Own Razorpay account" : value === "shared" ? "Shared service" : "Off"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Off</SelectItem>
            <SelectItem value="shared">Shared service (KingdomFlow account)</SelectItem>
            <SelectItem value="own" disabled={!hasOwnAccount}>
              Own Razorpay account{!hasOwnAccount ? " (connect one above first)" : ""}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "shared" && (
        <p className="text-xs text-muted-foreground">
          KingdomFlow deducts a {SHARED_SERVICE_FEE_PERCENT} transaction fee from gifts collected this way before
          paying it out to you — a donor giving ₹1,000 leaves {formatCurrency(sharedServiceNetAmount(1000))} owed to
          your church.
        </p>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {mode !== "none" && (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant={enabled ? "outline" : "default"} onClick={() => save(mode, !enabled)} disabled={pending}>
            {enabled ? "Disable link" : "Enable link"}
          </Button>
        </div>
      )}

      {mode !== "none" && enabled && <CopyLinkRow link={link} />}
    </div>
  );
}

const payoutRequestInitialState: PayoutRequestState = {};

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Only relevant for 'shared'-mode fundraisers — the church's own account
// (payment_mode: 'own') never has money sitting on the platform to begin
// with, so there's nothing to request. Rendered as one row per fundraiser
// inside the wallet dialog below.
function PayoutRequestRow({
  fundraiserId,
  fundraiserTitle,
  sharedCollected,
  sharedOwed,
  pendingPayoutRequest,
}: {
  fundraiserId: string;
  fundraiserTitle: string;
  sharedCollected: number;
  sharedOwed: number;
  pendingPayoutRequest: { id: string; amount: number } | null;
}) {
  const [state, setState] = useState<PayoutRequestState>(payoutRequestInitialState);
  const [pending, startTransition] = useTransition();

  function handleRequest() {
    setState(payoutRequestInitialState);
    const formData = new FormData();
    formData.set("fundraiserId", fundraiserId);
    startTransition(async () => {
      const result = await requestFundraiserPayout(state, formData);
      setState(result);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{fundraiserTitle}</p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(sharedCollected)} collected · {SHARED_SERVICE_FEE_PERCENT} fee ({formatCurrency(sharedServiceFee(sharedCollected))}) ·{" "}
            {formatCurrency(sharedOwed)} owed to you
          </p>
        </div>
        {pendingPayoutRequest ? (
          <form action={cancelFundraiserPayoutRequest} className="flex items-center gap-2">
            <input type="hidden" name="requestId" value={pendingPayoutRequest.id} />
            <Badge variant="secondary">Requested — {formatCurrency(pendingPayoutRequest.amount)}</Badge>
            <Button type="submit" size="sm" variant="ghost">
              Cancel
            </Button>
          </form>
        ) : sharedOwed > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={handleRequest} disabled={pending}>
            {pending ? "Requesting..." : "Request payout"}
          </Button>
        ) : sharedCollected > 0 ? (
          <Badge variant="secondary">Fully paid out</Badge>
        ) : (
          <Badge variant="secondary">No gifts yet</Badge>
        )}
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function WalletBalanceButton({ fundraisers }: { fundraisers: FundraiserRow[] }) {
  // Shows as soon as a fundraiser is set to shared mode, not only once
  // something's actually been collected — otherwise the wallet is
  // invisible exactly when someone's checking whether it's working.
  const sharedFundraisers = fundraisers.filter((f) => f.payment_mode === "shared");
  const totalOwed = sharedFundraisers.reduce((sum, f) => sum + f.sharedOwed, 0);
  const hasPendingRequest = sharedFundraisers.some((f) => f.pendingPayoutRequest);

  if (sharedFundraisers.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" className="gap-2">
            <Wallet className="size-4 text-primary" />
            <span className="font-heading font-bold">{formatCurrency(totalOwed)}</span>
            <span className="text-muted-foreground">available</span>
            {hasPendingRequest && <Badge variant="secondary">Requested</Badge>}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shared service balance</DialogTitle>
          <DialogDescription>
            Money collected through KingdomFlow&apos;s shared Razorpay account, waiting to be wired to you — a{" "}
            {SHARED_SERVICE_FEE_PERCENT} transaction fee is deducted before payout. Request a payout per campaign
            below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {sharedFundraisers.map((fundraiser) => (
            <PayoutRequestRow
              key={fundraiser.id}
              fundraiserId={fundraiser.id}
              fundraiserTitle={fundraiser.title}
              sharedCollected={fundraiser.sharedCollected}
              sharedOwed={fundraiser.sharedOwed}
              pendingPayoutRequest={fundraiser.pendingPayoutRequest}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type FieldErrorsProp = FundraiserFormState["fieldErrors"];

function FundraiserFields({
  fundraiser,
  branches,
  members,
  branchId,
  onBranchChange,
  managedBy,
  onManagedByChange,
  status,
  onStatusChange,
  errors,
}: {
  fundraiser?: Fundraiser;
  branches: BranchBasic[];
  members: MemberBasic[];
  branchId: string;
  onBranchChange: (value: string) => void;
  managedBy: string;
  onManagedByChange: (value: string) => void;
  status: FundraiserStatus;
  onStatusChange: (value: FundraiserStatus) => void;
  errors?: FieldErrorsProp;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={fundraiser?.title}
          placeholder="New Roof Campaign"
          required
          aria-invalid={Boolean(errors?.title)}
        />
        <FieldError id="title-error" message={errors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="goalAmount">Goal amount</Label>
        <Input
          id="goalAmount"
          name="goalAmount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={fundraiser?.goal_amount ?? ""}
          placeholder="5000"
          aria-invalid={Boolean(errors?.goalAmount)}
        />
        <FieldError id="goalAmount-error" message={errors?.goalAmount} />
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
        <Label htmlFor="managedBy">Managed by (optional)</Label>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={fundraiser?.start_date ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={fundraiser?.end_date ?? ""} aria-invalid={Boolean(errors?.endDate)} />
          <FieldError id="endDate-error" message={errors?.endDate} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={(v) => onStatusChange((v ?? "active") as FundraiserStatus)}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue>{(v: string | null) => STATUS_LABELS[(v ?? "active") as FundraiserStatus]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FUNDRAISER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" name="description" defaultValue={fundraiser?.description ?? ""} rows={3} />
      </div>
    </div>
  );
}

function AddFundraiserDialog({
  organizationId,
  branches,
  members,
}: {
  organizationId: string;
  branches: BranchBasic[];
  members: MemberBasic[];
}) {
  const [state, setState] = useState<FundraiserFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [managedBy, setManagedBy] = useState("");
  const [status, setStatus] = useState<FundraiserStatus>("active");

  function reset() {
    setState(initialState);
    setBranchId("");
    setManagedBy("");
    setStatus("active");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createFundraiser(state, formData);
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
            Add fundraiser
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a fundraiser</DialogTitle>
          <DialogDescription>Set up a campaign with a goal — donations can be linked to it as they come in.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="managedBy" value={managedBy} />
          <input type="hidden" name="status" value={status} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FundraiserFields
            branches={branches}
            members={members}
            branchId={branchId}
            onBranchChange={setBranchId}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            status={status}
            onStatusChange={setStatus}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add fundraiser"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFundraiserDialog({
  fundraiser,
  branches,
  members,
}: {
  fundraiser: Fundraiser;
  branches: BranchBasic[];
  members: MemberBasic[];
}) {
  const [state, setState] = useState<FundraiserFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(fundraiser.branch_id ?? "");
  const [managedBy, setManagedBy] = useState(fundraiser.managed_by ?? "");
  const [status, setStatus] = useState<FundraiserStatus>(fundraiser.status);

  function reset() {
    setState(initialState);
    setBranchId(fundraiser.branch_id ?? "");
    setManagedBy(fundraiser.managed_by ?? "");
    setStatus(fundraiser.status);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFundraiser(state, formData);
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
          <DialogTitle>Edit fundraiser</DialogTitle>
          <DialogDescription>Update this campaign&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={fundraiser.id} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="managedBy" value={managedBy} />
          <input type="hidden" name="status" value={status} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FundraiserFields
            fundraiser={fundraiser}
            branches={branches}
            members={members}
            branchId={branchId}
            onBranchChange={setBranchId}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            status={status}
            onStatusChange={setStatus}
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

function FundraiserCard({
  fundraiser,
  branches,
  members,
  siteUrl,
  hasOwnAccount,
  canWrite,
  canDelete,
}: {
  fundraiser: FundraiserRow;
  branches: BranchBasic[];
  members: MemberBasic[];
  siteUrl: string;
  hasOwnAccount: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const percent = fundraiser.goal_amount > 0 ? Math.min(100, (fundraiser.raisedAmount / fundraiser.goal_amount) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold">{fundraiser.title}</h3>
              <Badge variant={STATUS_VARIANTS[fundraiser.status]}>{STATUS_LABELS[fundraiser.status]}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <UserRound className="size-3.5" />
                {personName(fundraiser.members)}
              </span>
              {fundraiser.branches && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {fundraiser.branches.name}
                </span>
              )}
              {(fundraiser.start_date || fundraiser.end_date) && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {formatDate(fundraiser.start_date)}
                  {fundraiser.end_date ? ` – ${formatDate(fundraiser.end_date)}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canWrite && <EditFundraiserDialog fundraiser={fundraiser} branches={branches} members={members} />}
            {canDelete && (
              <form action={deleteFundraiser}>
                <input type="hidden" name="id" value={fundraiser.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{formatMoney(fundraiser.raisedAmount)} raised</span>
            <span className="text-muted-foreground">of {formatMoney(fundraiser.goal_amount)} goal</span>
          </div>
          <Progress value={fundraiser.raisedAmount} max={fundraiser.goal_amount}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          <p className="text-xs text-muted-foreground">{percent.toFixed(0)}% of goal</p>
        </div>

        {fundraiser.description && <p className="text-sm text-muted-foreground">{fundraiser.description}</p>}

        <GivingLinkSettings fundraiser={fundraiser} siteUrl={siteUrl} hasOwnAccount={hasOwnAccount} canWrite={canWrite} />
      </CardContent>
    </Card>
  );
}

export function FundraisersManager({
  organizationId,
  fundraisers,
  branches,
  members,
  siteUrl,
  isOrgAdmin,
  hasOwnAccount,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  fundraisers: FundraiserRow[];
  branches: BranchBasic[];
  members: MemberBasic[];
  siteUrl: string;
  isOrgAdmin: boolean;
  hasOwnAccount: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      {isOrgAdmin && <RazorpayAccountCard organizationId={organizationId} connected={hasOwnAccount} />}

      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <WalletBalanceButton fundraisers={fundraisers} />
          <AddFundraiserDialog organizationId={organizationId} branches={branches} members={members} />
        </div>
      )}

      {fundraisers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Target className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No fundraisers yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Add fundraiser" to start your first campaign.' : "Check back once a campaign is set up."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fundraisers.map((fundraiser) => (
            <FundraiserCard
              key={fundraiser.id}
              fundraiser={fundraiser}
              branches={branches}
              members={members}
              siteUrl={siteUrl}
              hasOwnAccount={hasOwnAccount}
              canWrite={canWrite}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
