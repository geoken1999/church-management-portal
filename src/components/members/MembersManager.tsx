"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, MapPin, X, Check, Inbox, Search, Upload, Download } from "lucide-react";
import {
  createMember,
  updateMember,
  deleteMember,
  approveMember,
  bulkUpdateMemberStatus,
  bulkDeleteMembers,
  type MemberFormState,
} from "@/lib/members/actions";
import { downloadMemberTemplate, bulkImportMembers } from "@/lib/members/bulk-actions";
import { PublicJoinLinkCard } from "@/components/members/PublicJoinLinkCard";
import type { Branch, Member, MemberFieldDefinition, MemberStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { FieldDefinitionsManager } from "@/components/members/FieldDefinitionsManager";

type MemberWithBranch = Member & { branches: Pick<Branch, "id" | "name"> | null };

const initialState: MemberFormState = {};
const STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "left", label: "Left" },
  { value: "pending", label: "Pending" },
];

function statusBadgeVariant(status: MemberStatus): "secondary" | "outline" | "default" {
  if (status === "active") return "secondary";
  if (status === "pending") return "default";
  return "outline";
}

function statusLabel(status: MemberStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function CustomFieldInput({
  definition,
  value,
  errors,
}: {
  definition: MemberFieldDefinition;
  value: unknown;
  errors?: Record<string, string>;
}) {
  const name = `custom_${definition.key}`;
  const id = `custom-${definition.key}`;
  const error = errors?.[definition.key];

  if (definition.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name={name} defaultChecked={Boolean(value)} />
        {definition.label}
        {definition.required && <span className="text-destructive">*</span>}
      </label>
    );
  }

  if (definition.field_type === "select") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>
          {definition.label}
          {definition.required && <span className="text-destructive">*</span>}
        </Label>
        <Select name={name} defaultValue={typeof value === "string" ? value : undefined}>
          <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(definition.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`${id}-error`} message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {definition.label}
        {definition.required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        name={name}
        type={definition.field_type === "number" ? "number" : definition.field_type === "date" ? "date" : "text"}
        defaultValue={typeof value === "string" || typeof value === "number" ? value : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function MemberFormFields({
  member,
  definitions,
  branches,
  errors,
}: {
  member?: MemberWithBranch;
  definitions: MemberFieldDefinition[];
  branches: Branch[];
  errors?: MemberFormState["fieldErrors"];
}) {
  const [status, setStatus] = useState<string>(member?.status ?? "active");
  const [branchId, setBranchId] = useState<string>(member?.branch_id ?? "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={member?.first_name}
            required
            aria-invalid={Boolean(errors?.firstName)}
            aria-describedby={errors?.firstName ? "firstName-error" : undefined}
          />
          <FieldError id="firstName-error" message={errors?.firstName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={member?.last_name}
            required
            aria-invalid={Boolean(errors?.lastName)}
            aria-describedby={errors?.lastName ? "lastName-error" : undefined}
          />
          <FieldError id="lastName-error" message={errors?.lastName} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={member?.email ?? ""}
          aria-invalid={Boolean(errors?.email)}
          aria-describedby={errors?.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errors?.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={member?.phone ?? ""}
          aria-invalid={Boolean(errors?.phone)}
          aria-describedby={errors?.phone ? "phone-error" : undefined}
        />
        <FieldError id="phone-error" message={errors?.phone} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <input type="hidden" name="status" value={status} />
          <Select value={status} onValueChange={(v) => setStatus(v ?? "active")}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue>{(value: string | null) => statusLabel((value ?? "active") as MemberStatus)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="branchId">Branch</Label>
          <input type="hidden" name="branchId" value={branchId} />
          <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
            <SelectTrigger id="branchId" className="w-full">
              <SelectValue placeholder="No branch">
                {(value: string | null) => branches.find((b) => b.id === value)?.name ?? "No branch"}
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
      </div>

      {definitions.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          {definitions.map((def) => (
            <CustomFieldInput
              key={def.id}
              definition={def}
              value={member?.custom_fields?.[def.key]}
              errors={errors?.custom}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddMemberDialog({
  organizationId,
  definitions,
  branches,
}: {
  organizationId: string;
  definitions: MemberFieldDefinition[];
  branches: Branch[];
}) {
  const [state, setState] = useState<MemberFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMember(state, formData);
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
            Add member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>Add someone to your church&apos;s roster.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <MemberFormFields definitions={definitions} branches={branches} errors={state.fieldErrors} />
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

function EditMemberDialog({
  organizationId,
  member,
  definitions,
  branches,
}: {
  organizationId: string;
  member: MemberWithBranch;
  definitions: MemberFieldDefinition[];
  branches: Branch[];
}) {
  const [state, setState] = useState<MemberFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateMember(state, formData);
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
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>Update {member.first_name}&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <MemberFormFields member={member} definitions={definitions} branches={branches} errors={state.fieldErrors} />
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

function MemberCard({
  member,
  definitions,
  branches,
  organizationId,
  canManage,
  selected,
  onToggleSelect,
}: {
  member: MemberWithBranch;
  definitions: MemberFieldDefinition[];
  branches: Branch[];
  organizationId: string;
  canManage: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {canManage && (
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onToggleSelect(checked === true)}
                aria-label={`Select ${member.first_name} ${member.last_name}`}
                className="mt-1"
              />
            )}
            <div>
              <h3 className="font-heading text-base font-bold">
                {member.first_name} {member.last_name}
              </h3>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant={statusBadgeVariant(member.status)}>{statusLabel(member.status)}</Badge>
                {member.branches && (
                  <Badge variant="outline">
                    <MapPin className="size-3" />
                    {member.branches.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <EditMemberDialog
              organizationId={organizationId}
              member={member}
              definitions={definitions}
              branches={branches}
            />
            {canManage && (
              <form action={deleteMember}>
                <input type="hidden" name="memberId" value={member.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {member.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {member.email}
            </span>
          )}
          {member.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" />
              {member.phone}
            </span>
          )}
        </div>
        {definitions.length > 0 && (
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {definitions.map((def) => {
              const value = member.custom_fields?.[def.key];
              if (value === null || value === undefined || value === "") return null;
              return (
                <div key={def.id} className="flex items-center gap-1.5">
                  <dt className="text-muted-foreground">{def.label}:</dt>
                  <dd className="font-medium">
                    {def.field_type === "checkbox" ? (value ? "Yes" : "No") : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function PendingRequestCard({ member }: { member: MemberWithBranch }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {member.first_name} {member.last_name}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {member.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {member.email}
              </span>
            )}
            {member.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {member.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={approveMember}>
            <input type="hidden" name="memberId" value={member.id} />
            <Button type="submit" size="sm">
              <Check className="size-3.5" />
              Approve
            </Button>
          </form>
          <form action={deleteMember}>
            <input type="hidden" name="memberId" value={member.id} />
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="size-3.5" />
              Reject
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmDeleteDialog({
  count,
  memberIds,
  onDone,
}: {
  count: number;
  memberIds: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      memberIds.forEach((id) => formData.append("memberIds", id));
      await bulkDeleteMembers(formData);
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="destructive" size="sm">
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} {count === 1 ? "member" : "members"}?</DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="destructive" disabled={pending} onClick={handleConfirm}>
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(status: MemberStatus) {
    startTransition(async () => {
      const formData = new FormData();
      selectedIds.forEach((id) => formData.append("memberIds", id));
      formData.set("status", status);
      await bulkUpdateMemberStatus(formData);
      onClear();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium">
        {selectedIds.length} {selectedIds.length === 1 ? "member" : "members"} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setStatus("active")}>
          Mark active
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setStatus("left")}>
          Mark left
        </Button>
        <ConfirmDeleteDialog count={selectedIds.length} memberIds={selectedIds} onDone={onClear} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([byteNumbers], { type: mimeType });
}

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function BulkUploadMembersDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ imported: number; rowErrors: { row: number; message: string }[] } | null>(
    null,
  );
  const [downloading, startDownload] = useTransition();
  const [importing, startImport] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFile(null);
      setError(undefined);
      setResult(null);
    }
  }

  function handleDownloadTemplate() {
    startDownload(async () => {
      const res = await downloadMemberTemplate(organizationId);
      if (res.error || !res.base64 || !res.filename) {
        setError(res.error ?? "Couldn't generate the template.");
        return;
      }
      const blob = base64ToBlob(res.base64, XLSX_MIME_TYPE);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = res.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleImport() {
    if (!file) return;
    setError(undefined);
    setResult(null);
    const formData = new FormData();
    formData.set("file", file);
    startImport(async () => {
      const res = await bulkImportMembers(organizationId, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ imported: res.imported ?? 0, rowErrors: res.rowErrors ?? [] });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Upload className="size-4" />
            Bulk upload
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk upload members</DialogTitle>
          <DialogDescription>Add many members at once from an Excel file.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">1. Download the template</p>
            <p className="text-xs text-muted-foreground">
              Includes this organization&apos;s branches and custom fields. Row 2 is an example — replace or delete
              it before importing.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={downloading}>
              <Download className="size-3.5" />
              {downloading ? "Preparing..." : "Download template"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-file">2. Upload your completed file</Label>
            <input
              ref={inputRef}
              id="bulk-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
              <Upload className="size-4" />
              {file ? file.name : "Choose an Excel file"}
            </Button>
          </div>

          {result && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">
                {result.imported} member{result.imported === 1 ? "" : "s"} imported.
              </p>
              {result.rowErrors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive">
                    {result.rowErrors.length} row{result.rowErrors.length === 1 ? "" : "s"} skipped:
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.rowErrors.map((rowError) => (
                      <li key={rowError.row}>
                        Row {rowError.row}: {rowError.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={handleImport} disabled={importing || !file}>
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MembersManager({
  organizationId,
  orgSlug,
  orgName,
  siteUrl,
  members,
  definitions,
  branches,
  canManage,
}: {
  organizationId: string;
  orgSlug: string;
  orgName: string;
  siteUrl: string;
  members: MemberWithBranch[];
  definitions: MemberFieldDefinition[];
  branches: Branch[];
  canManage: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const pendingMembers = members.filter((m) => m.status === "pending");
  const rosterMembers = members.filter((m) => m.status !== "pending");

  const query = search.trim().toLowerCase();
  const filteredRoster = rosterMembers.filter((member) => {
    if (query) {
      const name = `${member.first_name} ${member.last_name}`.toLowerCase();
      const phoneMatch = member.phone?.toLowerCase().includes(query) ?? false;
      if (!name.includes(query) && !phoneMatch) return false;
    }
    if (branchFilter === "none" && member.branch_id !== null) return false;
    if (branchFilter !== "all" && branchFilter !== "none" && member.branch_id !== branchFilter) return false;
    if (statusFilter !== "all" && member.status !== statusFilter) return false;
    return true;
  });

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const allSelected = filteredRoster.length > 0 && selectedIds.length === filteredRoster.length;
  const filtersActive = query !== "" || branchFilter !== "all" || statusFilter !== "all";

  return (
    <div className="space-y-6">
      {canManage && <PublicJoinLinkCard orgSlug={orgSlug} orgName={orgName} siteUrl={siteUrl} />}

      {canManage && pendingMembers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-primary" />
            <h2 className="font-heading text-lg font-bold">
              Pending requests ({pendingMembers.length})
            </h2>
          </div>
          <div className="space-y-3">
            {pendingMembers.map((member) => (
              <PendingRequestCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone"
              className="pl-8"
              aria-label="Search members"
            />
          </div>
          <Select value={branchFilter} onValueChange={(v) => setBranchFilter(v ?? "all")}>
            <SelectTrigger className="w-40" aria-label="Filter by branch">
              <SelectValue>
                {(value: string | null) => {
                  if (value === "none") return "No branch";
                  return branches.find((b) => b.id === value)?.name ?? "All branches";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              <SelectItem value="none">No branch</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-36" aria-label="Filter by status">
              <SelectValue>
                {(value: string | null) =>
                  value && value !== "all" ? statusLabel(value as MemberStatus) : "All statuses"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="left">Left</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {canManage && filteredRoster.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelectedIds(checked ? filteredRoster.map((m) => m.id) : [])}
                  aria-label="Select all members"
                />
                Select all
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <FieldDefinitionsManager
                organizationId={organizationId}
                definitions={definitions}
                hasMembers={members.length > 0}
              />
            )}
            {canManage && <BulkUploadMembersDialog organizationId={organizationId} />}
            <AddMemberDialog organizationId={organizationId} definitions={definitions} branches={branches} />
          </div>
        </div>

        {canManage && selectedIds.length > 0 && (
          <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />
        )}

        {filteredRoster.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {rosterMembers.length === 0
                ? 'No members yet. Click "Add member" to add your first record.'
                : filtersActive
                  ? "No members match your filters."
                  : "No members yet."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRoster.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                definitions={definitions}
                branches={branches}
                organizationId={organizationId}
                canManage={canManage}
                selected={selectedIds.includes(member.id)}
                onToggleSelect={(checked) => toggle(member.id, checked)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
