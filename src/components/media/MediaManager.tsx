"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UserRound, Wrench, Share2, StickyNote } from "lucide-react";
import {
  createMediaTeamMember,
  updateMediaTeamMember,
  deleteMediaTeamMember,
  createMediaEquipment,
  updateMediaEquipment,
  deleteMediaEquipment,
  createMediaSocialAccount,
  updateMediaSocialAccount,
  deleteMediaSocialAccount,
  type MediaTeamMemberFormState,
  type MediaEquipmentFormState,
  type MediaSocialAccountFormState,
} from "@/lib/media/actions";
import type { Member, MediaEquipment, MediaSocialAccount, MediaTeamMember } from "@/types/database";
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
type TeamMemberRow = MediaTeamMember & { members: MemberBasic | null };
type EquipmentRow = MediaEquipment & { members: MemberBasic | null };
type SocialAccountRow = MediaSocialAccount & { members: MemberBasic | null };

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

function PersonSelectField({
  members,
  value,
  onChange,
  label,
  required,
  error,
}: {
  members: MemberBasic[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  error?: string;
}) {
  const placeholder = required ? "Select a member" : "Unassigned";
  return (
    <div className="space-y-2">
      <Label htmlFor="managedBy">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id="managedBy" className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder={placeholder}>
            {(v: string | null) => personName(members.find((m) => m.id === v) ?? null)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value="">Unassigned</SelectItem>}
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.first_name} {member.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id="managedBy-error" message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media team
// ---------------------------------------------------------------------------

const initialTeamState: MediaTeamMemberFormState = {};

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
  errors?: MediaTeamMemberFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="memberId" value={memberId} />
      <PersonSelectField
        members={members}
        value={memberId}
        onChange={onMemberIdChange}
        label="Team member"
        required
        error={errors?.memberId}
      />
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          name="role"
          defaultValue={entry?.role}
          placeholder="Sound Engineer, Camera Operator, Livestream Producer..."
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
  const [state, setState] = useState<MediaTeamMemberFormState>(initialTeamState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMediaTeamMember(state, formData);
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
          <DialogTitle>Add a media team member</DialogTitle>
          <DialogDescription>Assign a congregation member to a media role.</DialogDescription>
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
  const [state, setState] = useState<MediaTeamMemberFormState>(initialTeamState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(entry.member_id);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateMediaTeamMember(state, formData);
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
          <DialogTitle>Edit media team member</DialogTitle>
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
            <form action={deleteMediaTeamMember}>
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

function MediaTeamTab({
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
            No media team members yet. {canManage && 'Click "Add team member" to assign your first role.'}
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
// Equipment
// ---------------------------------------------------------------------------

const initialEquipmentState: MediaEquipmentFormState = {};

function EquipmentFields({
  members,
  managedBy,
  onManagedByChange,
  entry,
  errors,
}: {
  members: MemberBasic[];
  managedBy: string;
  onManagedByChange: (value: string) => void;
  entry?: EquipmentRow;
  errors?: MediaEquipmentFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Equipment name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={entry?.name}
          placeholder="Main Sanctuary Camera, Wireless Mic Kit..."
          required
          aria-invalid={Boolean(errors?.name)}
          aria-describedby={errors?.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors?.name} />
      </div>
      <input type="hidden" name="managedBy" value={managedBy} />
      <PersonSelectField members={members} value={managedBy} onChange={onManagedByChange} label="Managed by" />
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} placeholder="Optional notes" rows={2} />
      </div>
    </div>
  );
}

function AddEquipmentDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<MediaEquipmentFormState>(initialEquipmentState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMediaEquipment(state, formData);
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
          setState(initialEquipmentState);
          setManagedBy("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add equipment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add equipment</DialogTitle>
          <DialogDescription>Track a piece of media equipment and who manages it.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <EquipmentFields
            members={members}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEquipmentDialog({ entry, members }: { entry: EquipmentRow; members: MemberBasic[] }) {
  const [state, setState] = useState<MediaEquipmentFormState>(initialEquipmentState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState(entry.managed_by ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateMediaEquipment(state, formData);
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
          setState(initialEquipmentState);
          setManagedBy(entry.managed_by ?? "");
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
          <DialogTitle>Edit equipment</DialogTitle>
          <DialogDescription>Update this equipment&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <EquipmentFields
            members={members}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
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

function EquipmentCard({
  entry,
  members,
  canManage,
}: {
  entry: EquipmentRow;
  members: MemberBasic[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{entry.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            {personName(entry.members)}
          </div>
          {entry.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {entry.notes}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <EditEquipmentDialog entry={entry} members={members} />
            <form action={deleteMediaEquipment}>
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

function MediaEquipmentTab({
  organizationId,
  members,
  equipment,
  canManage,
}: {
  organizationId: string;
  members: MemberBasic[];
  equipment: EquipmentRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddEquipmentDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {equipment.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No equipment logged yet. {canManage && 'Click "Add equipment" to add your first item.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {equipment.map((entry) => (
            <EquipmentCard key={entry.id} entry={entry} members={members} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social accounts
// ---------------------------------------------------------------------------

const initialSocialState: MediaSocialAccountFormState = {};

function SocialAccountFields({
  members,
  managedBy,
  onManagedByChange,
  entry,
  errors,
}: {
  members: MemberBasic[];
  managedBy: string;
  onManagedByChange: (value: string) => void;
  entry?: SocialAccountRow;
  errors?: MediaSocialAccountFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="platform">Platform</Label>
        <Input
          id="platform"
          name="platform"
          defaultValue={entry?.platform}
          placeholder="Instagram, YouTube, Facebook..."
          required
          aria-invalid={Boolean(errors?.platform)}
          aria-describedby={errors?.platform ? "platform-error" : undefined}
        />
        <FieldError id="platform-error" message={errors?.platform} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="handle">Handle or link</Label>
        <Input id="handle" name="handle" defaultValue={entry?.handle ?? ""} placeholder="@ourchurch" />
      </div>
      <input type="hidden" name="managedBy" value={managedBy} />
      <PersonSelectField members={members} value={managedBy} onChange={onManagedByChange} label="Managed by" />
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} placeholder="Optional notes" rows={2} />
      </div>
    </div>
  );
}

function AddSocialAccountDialog({ organizationId, members }: { organizationId: string; members: MemberBasic[] }) {
  const [state, setState] = useState<MediaSocialAccountFormState>(initialSocialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMediaSocialAccount(state, formData);
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
          setState(initialSocialState);
          setManagedBy("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add account
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a social account</DialogTitle>
          <DialogDescription>Track a social platform and who manages it.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <SocialAccountFields
            members={members}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSocialAccountDialog({ entry, members }: { entry: SocialAccountRow; members: MemberBasic[] }) {
  const [state, setState] = useState<MediaSocialAccountFormState>(initialSocialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [managedBy, setManagedBy] = useState(entry.managed_by ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateMediaSocialAccount(state, formData);
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
          setState(initialSocialState);
          setManagedBy(entry.managed_by ?? "");
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
          <DialogTitle>Edit social account</DialogTitle>
          <DialogDescription>Update this account&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={entry.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <SocialAccountFields
            members={members}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
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

function SocialAccountCard({
  entry,
  members,
  canManage,
}: {
  entry: SocialAccountRow;
  members: MemberBasic[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Share2 className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-base font-bold">{entry.platform}</h3>
            {entry.handle && <Badge variant="secondary">{entry.handle}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            {personName(entry.members)}
          </div>
          {entry.notes && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              {entry.notes}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <EditSocialAccountDialog entry={entry} members={members} />
            <form action={deleteMediaSocialAccount}>
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

function MediaSocialTab({
  organizationId,
  members,
  socialAccounts,
  canManage,
}: {
  organizationId: string;
  members: MemberBasic[];
  socialAccounts: SocialAccountRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <AddSocialAccountDialog organizationId={organizationId} members={members} />
        </div>
      )}

      {socialAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No social accounts logged yet. {canManage && 'Click "Add account" to add your first platform.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {socialAccounts.map((entry) => (
            <SocialAccountCard key={entry.id} entry={entry} members={members} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function MediaManager({
  organizationId,
  members,
  teamMembers,
  equipment,
  socialAccounts,
  canManage,
}: {
  organizationId: string;
  members: MemberBasic[];
  teamMembers: TeamMemberRow[];
  equipment: EquipmentRow[];
  socialAccounts: SocialAccountRow[];
  canManage: boolean;
}) {
  return (
    <Tabs defaultValue="team">
      <TabsList>
        <TabsIndicator />
        <TabsTab value="team">Team</TabsTab>
        <TabsTab value="equipment">Equipment</TabsTab>
        <TabsTab value="social">Social Media</TabsTab>
      </TabsList>
      <TabsPanel value="team">
        <MediaTeamTab
          organizationId={organizationId}
          members={members}
          teamMembers={teamMembers}
          canManage={canManage}
        />
      </TabsPanel>
      <TabsPanel value="equipment">
        <MediaEquipmentTab
          organizationId={organizationId}
          members={members}
          equipment={equipment}
          canManage={canManage}
        />
      </TabsPanel>
      <TabsPanel value="social">
        <MediaSocialTab
          organizationId={organizationId}
          members={members}
          socialAccounts={socialAccounts}
          canManage={canManage}
        />
      </TabsPanel>
    </Tabs>
  );
}
