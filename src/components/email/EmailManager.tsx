"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import TiptapImage from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImageIcon,
  Undo2,
  Redo2,
  Mail,
  Search,
  Send,
  Eye,
  Settings,
  Paperclip,
  X,
} from "lucide-react";
import {
  sendBulkEmailAction,
  testSmtpConnection,
  saveEmailSmtpSettings,
  deleteEmailSmtpSettings,
  requestEmailSetup,
  uploadEmailImage,
} from "@/lib/email/actions";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/email/validation";
import { formatBytes } from "@/lib/plans/format";
import type { EmailSmtpSummary } from "@/lib/email/dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "cn";

export interface EmailRecipientOption {
  id: string;
  name: string;
  email: string;
  branchId: string | null;
  branchName: string | null;
}

export interface EmailBranchOption {
  id: string;
  name: string;
}

export interface EmailCampaignRow {
  id: string;
  subject: string;
  body_html: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { email: string; error: string }[];
  status: "sent" | "partial_failure" | "failed";
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseExtraEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_PATTERN.test(e)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Rich text toolbar
// ---------------------------------------------------------------------------

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor) {
  const previousUrl = (editor.getAttributes("link").href as string | undefined) ?? "";
  const url = window.prompt("Link URL", previousUrl || "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function InsertImageButton({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    const formData = new FormData();
    formData.set("image", file);
    startUpload(async () => {
      const result = await uploadEmailImage(formData);
      if (result.error || !result.url) {
        setError(result.error ?? "Couldn't upload that image.");
        return;
      }
      editor.chain().focus().setImage({ src: result.url }).run();
    });
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <ToolbarButton
        label="Insert image"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        <ImageIcon className="size-4" />
      </ToolbarButton>
      {error && (
        <p className="absolute top-full left-0 z-10 mt-1 w-48 rounded-md bg-destructive px-2 py-1 text-xs text-white shadow">
          {error}
        </p>
      )}
    </div>
  );
}

function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading"
        active={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} disabled={disabled} onClick={() => setLink(editor)}>
        <Link2 className="size-4" />
      </ToolbarButton>
      <InsertImageButton editor={editor} disabled={disabled} />
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton label="Undo" disabled={disabled || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={disabled || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipient picker
// ---------------------------------------------------------------------------

function RecipientPicker({
  members,
  branches,
  selectedIds,
  onToggle,
  onSelectAll,
  extraEmails,
  onExtraEmailsChange,
  disabled,
}: {
  members: EmailRecipientOption[];
  branches: EmailBranchOption[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], checked: boolean) => void;
  extraEmails: string;
  onExtraEmailsChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      if (branchId !== "all" && m.branchId !== branchId) return false;
      if (!term) return true;
      return m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term);
    });
  }, [members, search, branchId]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
  const extraCount = parseExtraEmails(extraEmails).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or email"
            className="pl-8"
            disabled={disabled}
          />
        </div>
        {branches.length > 0 && (
          <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "all")} disabled={disabled}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue>{() => (branchId === "all" ? "All branches" : (branches.find((b) => b.id === branchId)?.name ?? "All branches"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <label
          className={cn(
            "group/field-label flex items-center gap-2 border-b border-border px-3 py-2 text-sm",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
        >
          <Checkbox
            checked={allFilteredSelected}
            onCheckedChange={(checked) => onSelectAll(filtered.map((m) => m.id), checked === true)}
            aria-label="Select all filtered members"
            disabled={disabled}
          />
          Select all ({filtered.length})
        </label>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No members match.</p>
          ) : (
            filtered.map((member) => (
              <label
                key={member.id}
                className={cn(
                  "group/field-label flex items-center gap-2 px-3 py-2 text-sm",
                  disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent",
                )}
              >
                <Checkbox
                  checked={selectedIds.has(member.id)}
                  onCheckedChange={() => onToggle(member.id)}
                  aria-label={`Select ${member.name}`}
                  disabled={disabled}
                />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">{member.email}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="extra-emails">Additional email addresses</Label>
        <Textarea
          id="extra-emails"
          value={extraEmails}
          onChange={(e) => onExtraEmailsChange(e.target.value)}
          placeholder="One per line or comma-separated — for people who aren't members"
          rows={2}
          disabled={disabled}
        />
        {extraCount > 0 && <p className="text-xs text-muted-foreground">{extraCount} valid extra address{extraCount === 1 ? "" : "es"}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function RaiseTicketDialog({
  alreadyOpen,
  onSent,
  label,
}: {
  alreadyOpen: boolean;
  onSent: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMessage("");
      setError(undefined);
    }
  }

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("message", message);
      const result = await requestEmailSetup(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onSent();
    });
  }

  if (alreadyOpen) {
    return <Badge variant="secondary">Request sent — we&apos;ll be in touch</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {label ?? "Raise a ticket instead"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label ? "Ask us about your plan" : "Ask us to set up email for you"}</DialogTitle>
          <DialogDescription>
            {label
              ? "Need more shared emails or storage than the Basic plan includes? Send us a request and we'll follow up about upgrading."
              : "Don't want to configure SMTP yourself? Send us a request and we'll enable the shared email service for your organization."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ticket-message">Anything we should know? (optional)</Label>
          <Textarea
            id="ticket-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. we'd like to send from newsletter@ourchurch.org"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Sending..." : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Composer({
  members,
  branches,
  disabled,
  quotaExhausted,
  emailsRemaining,
  smtpSummary,
  setupRequestOpen,
  onConfigured,
  onTicketSent,
}: {
  members: EmailRecipientOption[];
  branches: EmailBranchOption[];
  disabled: boolean;
  quotaExhausted: boolean;
  emailsRemaining: number;
  smtpSummary: EmailSmtpSummary | null;
  setupRequestOpen: boolean;
  onConfigured: () => void;
  onTicketSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraEmails, setExtraEmails] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write your message..." }),
      TiptapImage.configure({ HTMLAttributes: { style: "max-width: 100%;" } }),
    ],
    editorProps: {
      attributes: {
        class: "tiptap min-h-40 px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  // The editor instance persists across renders — flipping `disabled` after
  // the composer already mounted (e.g. SMTP just got configured) needs to
  // update the existing instance, not just the initial option.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const extraCount = parseExtraEmails(extraEmails).length;
  const totalRecipients = selectedIds.size + extraCount;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function addAttachments(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachmentError(undefined);

    setAttachments((prev) => {
      const next = [...prev];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_ATTACHMENTS) {
          setAttachmentError(`You can attach at most ${MAX_ATTACHMENTS} files.`);
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachmentError(`"${file.name}" is larger than 5MB.`);
          continue;
        }
        const totalBytes = next.reduce((sum, f) => sum + f.size, 0) + file.size;
        if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          setAttachmentError("Attachments are too large combined — keep the total under 20MB.");
          break;
        }
        next.push(file);
      }
      return next;
    });

    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachmentError(undefined);
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSend() {
    if (!editor) return;
    setResult(null);

    const recipientEmails = [
      ...Array.from(selectedIds)
        .map((id) => membersById.get(id)?.email)
        .filter((email): email is string => Boolean(email)),
      ...parseExtraEmails(extraEmails),
    ];

    const formData = new FormData();
    formData.set("subject", subject);
    formData.set("html", editor.getHTML());
    formData.set("recipients", JSON.stringify(recipientEmails));
    for (const file of attachments) formData.append("attachments", file);

    startTransition(async () => {
      const response = await sendBulkEmailAction(formData);
      if (response.error) {
        setResult({ error: response.error });
        return;
      }
      setResult({
        success: `Sent to ${response.sentCount} recipient${response.sentCount === 1 ? "" : "s"}${
          response.failedCount ? ` (${response.failedCount} failed)` : ""
        }.`,
      });
      setSubject("");
      setSelectedIds(new Set());
      setExtraEmails("");
      setAttachments([]);
      editor.commands.clearContent();
    });
  }

  const canSend = !disabled && subject.trim().length > 0 && totalRecipients > 0 && !editor?.isEmpty;
  const usingSharedProvider = !smtpSummary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          Compose
          {disabled ? <Badge variant="destructive">Offline</Badge> : <Badge variant="secondary">Online</Badge>}
        </CardTitle>
        <CardDescription>Send an announcement or newsletter to your congregation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabled && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>
                {quotaExhausted
                  ? "You've used all of this month's shared email quota."
                  : "Email sending is offline — no SMTP or shared provider is configured."}
              </span>
              <SmtpSettingsDialog summary={smtpSummary} onSaved={onConfigured} />
              <RaiseTicketDialog
                alreadyOpen={setupRequestOpen}
                onSent={onTicketSent}
                label={quotaExhausted ? "Upgrade your plan" : undefined}
              />
            </AlertDescription>
          </Alert>
        )}
        {!disabled && usingSharedProvider && emailsRemaining <= 100 && (
          <Alert>
            <AlertDescription>
              {emailsRemaining.toLocaleString()} shared email{emailsRemaining === 1 ? "" : "s"} left this month on
              your Basic plan.
            </AlertDescription>
          </Alert>
        )}
        {result?.error && (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}
        {result?.success && (
          <Alert>
            <AlertDescription>{result.success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="This Sunday's update"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Message</Label>
          <div className="rounded-lg border border-border">
            <EditorToolbar editor={editor} disabled={disabled} />
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Recipients</Label>
          <RecipientPicker
            members={members}
            branches={branches}
            selectedIds={selectedIds}
            onToggle={toggle}
            disabled={disabled}
            onSelectAll={selectAll}
            extraEmails={extraEmails}
            onExtraEmailsChange={setExtraEmails}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Attachments</Label>
          {attachmentError && (
            <Alert variant="destructive">
              <AlertDescription>{attachmentError}</AlertDescription>
            </Alert>
          )}
          {attachments.length > 0 && (
            <ul className="space-y-1.5">
              {attachments.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
                >
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addAttachments(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
          >
            <Paperclip className="size-3.5" />
            Add attachment
          </Button>
          <p className="text-xs text-muted-foreground">Up to {MAX_ATTACHMENTS} files, 5MB each.</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {totalRecipients} recipient{totalRecipients === 1 ? "" : "s"} selected
          </p>
          <Button type="button" onClick={handleSend} disabled={!canSend || pending}>
            <Send className="size-4" />
            {pending ? "Sending..." : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function statusBadge(status: EmailCampaignRow["status"]) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "partial_failure") return <Badge variant="outline">Partially sent</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

function CampaignPreviewDialog({ campaign }: { campaign: EmailCampaignRow }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Preview email" />}>
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campaign.subject}</DialogTitle>
          <DialogDescription>
            Sent {new Date(campaign.created_at).toLocaleString("en-US")}
            {campaign.profiles ? ` by ${campaign.profiles.first_name} ${campaign.profiles.last_name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div
          className="tiptap max-h-96 overflow-y-auto rounded-lg border border-border p-3 text-sm"
          // body_html is sanitized server-side (allowlisted tags only) before storage in sanitizeEmailHtml.
          dangerouslySetInnerHTML={{ __html: campaign.body_html }}
        />
        {campaign.failed_recipients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Failed: {campaign.failed_recipients.map((f) => f.email).join(", ")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmailHistory({ campaigns }: { campaigns: EmailCampaignRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send history</CardTitle>
        <CardDescription>The last {campaigns.length} email{campaigns.length === 1 ? "" : "s"} sent to this organization.</CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No emails sent yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{campaign.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                    {campaign.sent_count}/{campaign.recipient_count} delivered
                    {campaign.profiles ? ` · ${campaign.profiles.first_name} ${campaign.profiles.last_name}` : ""}
                  </p>
                </div>
                {statusBadge(campaign.status)}
                <CampaignPreviewDialog campaign={campaign} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SMTP settings (bring-your-own mail server, overrides the shared provider)
// ---------------------------------------------------------------------------

function SmtpSettingsDialog({ summary, onSaved }: { summary: EmailSmtpSummary | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState(summary?.host ?? "");
  const [port, setPort] = useState(String(summary?.port ?? "587"));
  const [secure, setSecure] = useState(summary?.secure ?? false);
  const [username, setUsername] = useState(summary?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(summary?.fromEmail ?? "");
  const [fromName, setFromName] = useState(summary?.fromName ?? "");
  const [testResult, setTestResult] = useState<{ error?: string; success?: boolean } | null>(null);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setHost(summary?.host ?? "");
      setPort(String(summary?.port ?? "587"));
      setSecure(summary?.secure ?? false);
      setUsername(summary?.username ?? "");
      setPassword("");
      setFromEmail(summary?.fromEmail ?? "");
      setFromName(summary?.fromName ?? "");
      setTestResult(null);
      setSaveError(undefined);
    }
  }

  function buildFormData() {
    const formData = new FormData();
    formData.set("host", host);
    formData.set("port", port);
    if (secure) formData.set("secure", "on");
    formData.set("username", username);
    formData.set("password", password);
    formData.set("fromEmail", fromEmail);
    formData.set("fromName", fromName);
    return formData;
  }

  function handleTest() {
    setTestResult(null);
    startTest(async () => {
      const result = await testSmtpConnection(buildFormData());
      setTestResult(result);
    });
  }

  function handleSave() {
    setSaveError(undefined);
    startSave(async () => {
      const result = await saveEmailSmtpSettings(buildFormData());
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setOpen(false);
      onSaved();
    });
  }

  function applyGmailPreset() {
    setHost("smtp.gmail.com");
    setPort("587");
    setSecure(false);
    if (!fromEmail && username) setFromEmail(username);
  }

  const isGmail = host.trim().toLowerCase() === "smtp.gmail.com";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Settings className="size-3.5" />
        {summary ? "Edit" : "Set up your own SMTP"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your own SMTP server</DialogTitle>
          <DialogDescription>
            Send from your own mail server instead of the shared email service. Leave the password blank to keep
            the one already saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick setup:</span>
          <Button type="button" variant="outline" size="xs" onClick={applyGmailPreset}>
            Use Gmail
          </Button>
        </div>

        {isGmail && (
          <Alert>
            <AlertDescription className="space-y-1.5">
              <p>
                Gmail needs a 16-character{" "}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
                  App Password
                </a>{" "}
                (not your regular password) — this requires 2-Step Verification to be turned on first. The from
                address should match your Gmail address.
              </p>
              <p>
                Keep in mind Gmail&apos;s sending limits: about 500 recipients/day on a personal account, or 2,000/day
                on Google Workspace — each recipient counts as one send. Gmail may also flag large or frequent
                newsletter-style sends as spam more readily than a dedicated provider would. For a large
                congregation, the shared email service is usually more reliable — close this and raise a ticket
                instead if you&apos;d rather use that.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        {testResult?.error && (
          <Alert variant="destructive">
            <AlertDescription>{testResult.error}</AlertDescription>
          </Alert>
        )}
        {testResult?.success && (
          <Alert>
            <AlertDescription>Connection succeeded.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="smtp-host">Host</Label>
            <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port">Port</Label>
            <Input id="smtp-port" type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={secure} onCheckedChange={(checked) => setSecure(checked === true)} />
              Use TLS/SSL (port 465)
            </label>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="smtp-username">Username</Label>
            <Input id="smtp-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="smtp-password">Password</Label>
            <Input
              id="smtp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={summary ? "Leave blank to keep current password" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from-email">From address</Label>
            <Input id="smtp-from-email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from-name">From name</Label>
            <Input
              id="smtp-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Your church name"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !host || !port || !username}>
            {testing ? "Testing..." : "Test connection"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !host || !port || !username || !fromEmail}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveSmtpDialog({ onRemoved }: { onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await deleteEmailSmtpSettings();
      setOpen(false);
      onRemoved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm">Remove</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove your SMTP settings?</DialogTitle>
          <DialogDescription>Sending will fall back to the shared email service.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={handleRemove} disabled={pending}>
            {pending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmtpSettingsCard({
  summary,
  emailAvailable,
  onChanged,
}: {
  summary: EmailSmtpSummary | null;
  emailAvailable: boolean;
  onChanged: () => void;
}) {
  const statusBadge = summary ? (
    <Badge variant="secondary">Active</Badge>
  ) : emailAvailable ? (
    <Badge variant="outline">Using shared service</Badge>
  ) : (
    <Badge variant="destructive">Offline</Badge>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Your own SMTP</CardTitle>
          <CardDescription>
            {summary
              ? `Sending via ${summary.host} as ${summary.fromName || summary.fromEmail}`
              : "Optional — send from your own mail server instead of the shared email service."}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusBadge}
          <SmtpSettingsDialog summary={summary} onSaved={onChanged} />
          {summary && <RemoveSmtpDialog onRemoved={onChanged} />}
        </div>
      </CardHeader>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function EmailManager({
  canManage,
  emailAvailable,
  quotaExhausted,
  emailsRemaining,
  smtpSummary,
  setupRequestOpen,
  members,
  branches,
  campaigns,
}: {
  canManage: boolean;
  emailAvailable: boolean;
  quotaExhausted: boolean;
  emailsRemaining: number;
  smtpSummary: EmailSmtpSummary | null;
  setupRequestOpen: boolean;
  members: EmailRecipientOption[];
  branches: EmailBranchOption[];
  campaigns: EmailCampaignRow[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6">
      {canManage && <SmtpSettingsCard summary={smtpSummary} emailAvailable={emailAvailable} onChanged={refresh} />}

      {canManage ? (
        <Composer
          members={members}
          branches={branches}
          disabled={!emailAvailable}
          quotaExhausted={quotaExhausted}
          emailsRemaining={emailsRemaining}
          smtpSummary={smtpSummary}
          setupRequestOpen={setupRequestOpen}
          onConfigured={refresh}
          onTicketSent={refresh}
        />
      ) : !emailAvailable ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Email isn&apos;t set up for this organization yet. Ask an admin to configure it.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Only owners and admins can send email. You can still view what&apos;s been sent below.
          </CardContent>
        </Card>
      )}

      <EmailHistory campaigns={campaigns} />
    </div>
  );
}
