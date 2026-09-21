"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, StickyNote, FileText, Link2, Upload } from "lucide-react";
import {
  createWorshipTeamMember,
  updateWorshipTeamMember,
  deleteWorshipTeamMember,
  uploadWorshipDocument,
  deleteWorshipDocument,
  type WorshipTeamMemberFormState,
  type WorshipDocumentFormState,
} from "@/lib/worship/actions";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  documentTypeLabel,
  formatFileSize,
} from "@/lib/worship/validation";
import type { Member, WorshipDocument, WorshipTeamMember } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
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
type TeamMemberRow = WorshipTeamMember & { members: MemberBasic | null };

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

// ---------------------------------------------------------------------------
// Worship team
// ---------------------------------------------------------------------------

const initialTeamState: WorshipTeamMemberFormState = {};

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
        Team member<span className="text-destructive">*</span>
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

function TeamMemberFields({
  members,
  memberId,
  onMemberIdChange,
  entry,
  errors,
}: {
  members: MemberBasic[];
  memberId: string;
  onMemberIdChange: (value: string) => void;
  entry?: TeamMemberRow;
  errors?: WorshipTeamMemberFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="memberId" value={memberId} />
      <MemberSelectField members={members} value={memberId} onChange={onMemberIdChange} error={errors?.memberId} />
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          name="role"
          defaultValue={entry?.role}
          placeholder="Worship Leader, Vocalist, Guitarist, Keys..."
          required
          aria-invalid={Boolean(errors?.role)}
          aria-describedby={errors?.role ? "role-error" : undefined}
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

function AddTeamMemberDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<WorshipTeamMemberFormState>(initialTeamState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createWorshipTeamMember(state, formData);
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
          setState(initialTeamState);
          setMemberId("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add team member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a worship team member</DialogTitle>
          <DialogDescription>Assign a congregation member to a worship role.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <TeamMemberFields
            members={members}
            memberId={memberId}
            onMemberIdChange={setMemberId}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add team member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTeamMemberDialog({ entry, members }: { entry: TeamMemberRow; members: MemberBasic[] }) {
  const [state, setState] = useState<WorshipTeamMemberFormState>(initialTeamState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(entry.member_id);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateWorshipTeamMember(state, formData);
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
          setState(initialTeamState);
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
          <DialogTitle>Edit worship team member</DialogTitle>
          <DialogDescription>Update this assignment.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <TeamMemberFields
            members={members}
            memberId={memberId}
            onMemberIdChange={setMemberId}
            entry={entry}
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

function TeamMemberCard({
  entry,
  members,
  canManage,
}: {
  entry: TeamMemberRow;
  members: MemberBasic[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{personName(entry.members)}</h3>
          </div>
          <Badge variant="secondary">{entry.role}</Badge>
          {entry.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {entry.notes}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <EditTeamMemberDialog entry={entry} members={members} />
            <form action={deleteWorshipTeamMember}>
              <input type="hidden" name="id" value={entry.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorshipTeamTab({
  organizationId,
  members,
  teamMembers,
  canManage,
}: {
  organizationId: string;
  members: MemberBasic[];
  teamMembers: TeamMemberRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddTeamMemberDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {teamMembers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No worship team members yet. {canManage && 'Click "Add team member" to assign your first role.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {teamMembers.map((entry) => (
            <TeamMemberCard key={entry.id} entry={entry} members={members} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const initialDocumentState: WorshipDocumentFormState = {};
const MAX_DOCUMENT_MB = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024));

function UploadDocumentDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<WorshipDocumentFormState>(initialDocumentState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const error = clientError ?? state.error;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadWorshipDocument(state, formData);
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
          setState(initialDocumentState);
          setClientError(undefined);
          setFileName(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Upload document
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>Share a PDF or PowerPoint via a masked link.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Sunday Order of Service" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <input
              ref={inputRef}
              id="file"
              name="file"
              type="file"
              accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
                  setClientError("Only PDF and PowerPoint (.ppt/.pptx) files are supported.");
                  e.target.value = "";
                  setFileName(null);
                  return;
                }
                if (file.size > MAX_DOCUMENT_BYTES) {
                  setClientError(`File must be smaller than ${MAX_DOCUMENT_MB}MB.`);
                  e.target.value = "";
                  setFileName(null);
                  return;
                }

                setClientError(undefined);
                setFileName(file.name);
              }}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="w-full">
              <Upload className="size-4" />
              {fileName ?? "Choose a file"}
            </Button>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentCard({ document, siteUrl, canManage }: { document: WorshipDocument; siteUrl: string; canManage: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `${siteUrl}/share/document/${document.share_token}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{document.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{documentTypeLabel(document.file_type)}</Badge>
            <span>{formatFileSize(document.file_size)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate">{link}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" size="sm" variant="ghost" nativeButton={false} render={<a href={link} target="_blank" rel="noreferrer" />}>
            Open
          </Button>
          {canManage && (
            <form action={deleteWorshipDocument}>
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="path" value={document.file_path} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WorshipDocumentsTab({
  organizationId,
  siteUrl,
  documents,
  canManage,
}: {
  organizationId: string;
  siteUrl: string;
  documents: WorshipDocument[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <UploadDocumentDialog organizationId={organizationId} />
        </div>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No documents uploaded yet. {canManage && 'Click "Upload document" to share your first file.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} siteUrl={siteUrl} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function WorshipManager({
  organizationId,
  siteUrl,
  members,
  teamMembers,
  documents,
  canManage,
}: {
  organizationId: string;
  siteUrl: string;
  members: MemberBasic[];
  teamMembers: TeamMemberRow[];
  documents: WorshipDocument[];
  canManage: boolean;
}) {
  return (
    <Tabs defaultValue="team">
      <TabsList>
        <TabsIndicator />
        <TabsTab value="team">Team</TabsTab>
        <TabsTab value="documents">Documents</TabsTab>
      </TabsList>
      <TabsPanel value="team">
        <WorshipTeamTab
          organizationId={organizationId}
          members={members}
          teamMembers={teamMembers}
          canManage={canManage}
        />
      </TabsPanel>
      <TabsPanel value="documents">
        <WorshipDocumentsTab
          organizationId={organizationId}
          siteUrl={siteUrl}
          documents={documents}
          canManage={canManage}
        />
      </TabsPanel>
    </Tabs>
  );
}
