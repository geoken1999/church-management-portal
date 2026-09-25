"use client";

import { useMemo, useState, useTransition } from "react";
import { MessageCircle, Search, Send, TriangleAlert, Landmark, User } from "lucide-react";
import {
  saveOwnWhatsAppAccount,
  removeOwnWhatsAppAccount,
  sendBulkWhatsAppAction,
  sendWhatsAppReplyAction,
  markWhatsAppConversationRead,
  type WhatsAppAccountState,
  type SendWhatsAppState,
} from "@/lib/whatsapp/actions";
import { normalizePhoneNumber } from "@/lib/whatsapp/validation";
import type { WhatsAppMode } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

export interface WhatsAppRecipientOption {
  id: string;
  name: string;
  phone: string;
  countryCode: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface WhatsAppBranchOption {
  id: string;
  name: string;
}

export interface WhatsAppCampaignRow {
  id: string;
  mode: WhatsAppMode;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sent" | "partial_failure" | "failed";
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
}

export interface WhatsAppMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
}

export interface WhatsAppConversationRow {
  id: string;
  phone_number: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  members: { id: string; first_name: string; last_name: string } | null;
  messages: WhatsAppMessageRow[];
}

function parseExtraNumbers(raw: string, countryCode: string | null): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((entry) => normalizePhoneNumber(entry, countryCode))
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Own account connection card
// ---------------------------------------------------------------------------

const accountInitialState: WhatsAppAccountState = {};

function OwnAccountCard({
  organizationId,
  connected,
  whatsappNumber,
}: {
  organizationId: string;
  connected: boolean;
  whatsappNumber: string | null;
}) {
  const [state, setState] = useState<WhatsAppAccountState>(accountInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveOwnWhatsAppAccount(state, formData);
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
              <h3 className="font-heading text-sm font-bold">Your WhatsApp number</h3>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? `Connected — ${whatsappNumber}. Campaigns are unmetered, and you get a two-way chat inbox for replies.`
                  : "Connect a WhatsApp-enabled Twilio number for unmetered campaigns and a two-way chat inbox."}
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
              <form action={removeOwnWhatsAppAccount}>
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
                <Label htmlFor="accountSid" className="text-xs">
                  Account SID
                </Label>
                <Input id="accountSid" name="accountSid" placeholder="ACxxxxxxxxxxxxxxxx" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authToken" className="text-xs">
                  Auth Token
                </Label>
                <Input id="authToken" name="authToken" type="password" placeholder="••••••••••••" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber" className="text-xs">
                WhatsApp-enabled number
              </Label>
              <Input id="whatsappNumber" name="whatsappNumber" placeholder="+14155552671" required />
            </div>
            <p className="text-xs text-muted-foreground">
              From your Twilio Console. The number must already be WhatsApp-enabled — set your Twilio number&apos;s
              WhatsApp webhook to{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {typeof window !== "undefined" ? window.location.origin : ""}/api/whatsapp/webhook/{organizationId}
              </code>{" "}
              to receive replies here.
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

// ---------------------------------------------------------------------------
// Recipient picker (mirrors SMS's — same shape, WhatsApp instead of SMS)
// ---------------------------------------------------------------------------

function RecipientPicker({
  members,
  branches,
  selectedIds,
  onToggle,
  onSelectAll,
  extraNumbers,
  onExtraNumbersChange,
  orgCountryCode,
  disabled,
}: {
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], checked: boolean) => void;
  extraNumbers: string;
  onExtraNumbersChange: (value: string) => void;
  orgCountryCode: string | null;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      if (branchId !== "all" && m.branchId !== branchId) return false;
      if (!term) return true;
      return m.name.toLowerCase().includes(term) || m.phone.includes(term);
    });
  }, [members, search, branchId]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
  const extraCount = parseExtraNumbers(extraNumbers, orgCountryCode).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members by name or phone" className="pl-8" disabled={disabled} />
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
        <label className={disabled ? "flex cursor-not-allowed items-center gap-2 border-b border-border px-3 py-2 text-sm opacity-50" : "flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm"}>
          <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => onSelectAll(filtered.map((m) => m.id), checked === true)} aria-label="Select all filtered members" disabled={disabled} />
          Select all ({filtered.length})
        </label>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No members match.</p>
          ) : (
            filtered.map((member) => (
              <label key={member.id} className={disabled ? "flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm opacity-50" : "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent"}>
                <Checkbox checked={selectedIds.has(member.id)} onCheckedChange={() => onToggle(member.id)} aria-label={`Select ${member.name}`} disabled={disabled} />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">{member.phone}</span>
                {!member.countryCode && (
                  <Badge variant="destructive" className="shrink-0">
                    <TriangleAlert className="size-3" />
                    No country
                  </Badge>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whatsapp-extra-numbers">Additional phone numbers</Label>
        <Textarea id="whatsapp-extra-numbers" value={extraNumbers} onChange={(e) => onExtraNumbersChange(e.target.value)} placeholder="One per line or comma-separated — for people who aren't members" rows={2} disabled={disabled} />
        {extraCount > 0 && <p className="text-xs text-muted-foreground">{extraCount} valid extra number{extraCount === 1 ? "" : "s"}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({
  organizationId,
  members,
  branches,
  sharedAvailable,
  ownAvailable,
  whatsappRemaining,
  orgCountryCode,
}: {
  organizationId: string;
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  sharedAvailable: boolean;
  ownAvailable: boolean;
  whatsappRemaining: number;
  orgCountryCode: string | null;
}) {
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<WhatsAppMode>(ownAvailable ? "own" : "shared");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraNumbers, setExtraNumbers] = useState("");
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = mode === "shared" ? !sharedAvailable : !ownAvailable;
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const extraCount = parseExtraNumbers(extraNumbers, orgCountryCode).length;
  const totalRecipients = selectedIds.size + extraCount;

  const selectedWithoutCountry = Array.from(selectedIds)
    .map((id) => membersById.get(id))
    .filter((m): m is WhatsAppRecipientOption => Boolean(m && !m.countryCode));

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

  function handleSend() {
    setResult(null);

    if (selectedWithoutCountry.length > 0) {
      setResult({ error: `${selectedWithoutCountry.length} selected recipient${selectedWithoutCountry.length === 1 ? " has" : "s have"} no country set, so their number can't be sent to yet.` });
      return;
    }

    const recipients = [
      ...Array.from(selectedIds)
        .map((id) => membersById.get(id))
        .filter((m): m is WhatsAppRecipientOption => Boolean(m))
        .map((m) => ({ phone: m.phone, countryCode: m.countryCode })),
      ...parseExtraNumbers(extraNumbers, orgCountryCode).map((phone) => ({ phone, countryCode: orgCountryCode })),
    ];

    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("mode", mode);
    formData.set("body", body);
    formData.set("recipients", JSON.stringify(recipients));

    startTransition(async () => {
      const response: SendWhatsAppState = await sendBulkWhatsAppAction(formData);
      if (response.error) {
        setResult({ error: response.error });
        return;
      }
      setResult({ success: `Sent to ${response.sentCount} recipient${response.sentCount === 1 ? "" : "s"}${response.failedCount ? ` (${response.failedCount} failed)` : ""}.` });
      setBody("");
      setSelectedIds(new Set());
      setExtraNumbers("");
    });
  }

  const canSend = !disabled && body.trim().length > 0 && totalRecipients > 0 && selectedWithoutCountry.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary" />
          Compose
          {disabled ? <Badge variant="destructive">Offline</Badge> : <Badge variant="secondary">Online</Badge>}
        </CardTitle>
        <CardDescription>
          Send a WhatsApp announcement or reminder. Free-form text only reaches someone who&apos;s messaged you within
          the last 24 hours — outside that window, WhatsApp requires a pre-approved message template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(sharedAvailable || ownAvailable) && (
          <div className="space-y-1.5">
            <Label className="text-xs">Send using</Label>
            <Select value={mode} onValueChange={(v) => setMode((v ?? "shared") as WhatsAppMode)}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue>{() => (mode === "own" ? "Your WhatsApp number" : "Shared service (KingdomFlow number)")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ownAvailable && <SelectItem value="own">Your WhatsApp number (unmetered)</SelectItem>}
                <SelectItem value="shared">Shared service (KingdomFlow number)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {disabled && (
          <Alert variant="destructive">
            <AlertDescription>
              {mode === "own"
                ? "Connect your WhatsApp number above to send from it."
                : "Shared WhatsApp sending is offline — either it isn't configured, or your plan's monthly limit has been reached. Connect your own number, or upgrade your plan."}
            </AlertDescription>
          </Alert>
        )}
        {!disabled && mode === "shared" && whatsappRemaining <= 20 && (
          <Alert>
            <AlertDescription>{whatsappRemaining.toLocaleString()} shared WhatsApp messages left this month.</AlertDescription>
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
          <Label htmlFor="whatsapp-body">Message</Label>
          <Textarea id="whatsapp-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="This Sunday's service starts at 10am. See you there!" rows={4} disabled={disabled} />
        </div>

        <div className="space-y-1.5">
          <Label>Recipients</Label>
          <RecipientPicker members={members} branches={branches} selectedIds={selectedIds} onToggle={toggle} disabled={disabled} onSelectAll={selectAll} extraNumbers={extraNumbers} onExtraNumbersChange={setExtraNumbers} orgCountryCode={orgCountryCode} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{totalRecipients} recipient{totalRecipients === 1 ? "" : "s"} selected</p>
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

function statusBadge(status: WhatsAppCampaignRow["status"]) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "partial_failure") return <Badge variant="outline">Partially sent</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

function WhatsAppHistory({ campaigns }: { campaigns: WhatsAppCampaignRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send history</CardTitle>
        <CardDescription>The last {campaigns.length} message{campaigns.length === 1 ? "" : "s"} sent to this organization.</CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages sent yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{campaign.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {campaign.sent_count}/{campaign.recipient_count} delivered ·{" "}
                    {campaign.mode === "own" ? "your number" : "shared"}
                    {campaign.profiles ? ` · ${campaign.profiles.first_name} ${campaign.profiles.last_name}` : ""}
                  </p>
                </div>
                {statusBadge(campaign.status)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chat — 'own' mode only
// ---------------------------------------------------------------------------

function ChatThread({ conversationId, messages }: { conversationId: string; messages: WhatsAppMessageRow[] }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(conversationId, body);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="flex h-[28rem] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${message.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="whitespace-pre-line">{message.body}</p>
                <p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(message.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-border p-3">
        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Type a reply..."
            rows={2}
            className="flex-1"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="button" size="icon" onClick={handleSend} disabled={pending || !body.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Free-form replies only work within 24 hours of their last message to you.</p>
      </div>
    </div>
  );
}

function ChatInbox({ conversations }: { conversations: WhatsAppConversationRow[] }) {
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const [, startTransition] = useTransition();

  function selectConversation(id: string) {
    setActiveId(id);
    const conversation = conversations.find((c) => c.id === id);
    if (conversation && conversation.unread_count > 0) {
      startTransition(() => {
        markWhatsAppConversationRead(id);
      });
    }
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MessageCircle className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-heading text-base font-bold">No conversations yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Once someone messages your connected WhatsApp number, their conversation will show up here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  return (
    <Card className="overflow-hidden py-0">
      <div className="grid grid-cols-1 sm:grid-cols-[16rem_1fr]">
        <div className="max-h-[28rem] overflow-y-auto border-b border-border sm:max-h-none sm:border-r sm:border-b-0">
          {conversations.map((conversation) => {
            const name = conversation.members ? `${conversation.members.first_name} ${conversation.members.last_name}` : conversation.phone_number;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm hover:bg-accent ${active?.id === conversation.id ? "bg-accent" : ""}`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{name}</span>
                    {conversation.unread_count > 0 && <Badge>{conversation.unread_count}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{conversation.last_message_preview}</p>
                </div>
              </button>
            );
          })}
        </div>
        <div>{active && <ChatThread key={active.id} conversationId={active.id} messages={active.messages} />}</div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function WhatsAppManager({
  organizationId,
  canSend,
  isOrgAdmin,
  hasOwnAccount,
  ownWhatsAppNumber,
  sharedAvailable,
  ownAvailable,
  whatsappRemaining,
  members,
  branches,
  campaigns,
  conversations,
  orgCountryCode,
}: {
  organizationId: string;
  canSend: boolean;
  isOrgAdmin: boolean;
  hasOwnAccount: boolean;
  ownWhatsAppNumber: string | null;
  sharedAvailable: boolean;
  ownAvailable: boolean;
  whatsappRemaining: number;
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  campaigns: WhatsAppCampaignRow[];
  conversations: WhatsAppConversationRow[];
  orgCountryCode: string | null;
}) {
  return (
    <div className="space-y-6">
      {isOrgAdmin && <OwnAccountCard organizationId={organizationId} connected={hasOwnAccount} whatsappNumber={ownWhatsAppNumber} />}

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="campaigns">Campaigns</TabsTab>
          <TabsTab value="chat" disabled={!hasOwnAccount}>
            Chat {!hasOwnAccount && "(connect your number)"}
          </TabsTab>
        </TabsList>
        <TabsPanel value="campaigns">
          <div className="space-y-6">
            {canSend ? (
              <Composer
                organizationId={organizationId}
                members={members}
                branches={branches}
                sharedAvailable={sharedAvailable}
                ownAvailable={ownAvailable}
                whatsappRemaining={whatsappRemaining}
                orgCountryCode={orgCountryCode}
              />
            ) : (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  You don&apos;t have permission to send WhatsApp messages. You can still view what&apos;s been sent below.
                </CardContent>
              </Card>
            )}
            <WhatsAppHistory campaigns={campaigns} />
          </div>
        </TabsPanel>
        <TabsPanel value="chat">
          {hasOwnAccount ? (
            <ChatInbox conversations={conversations} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Connect your own WhatsApp number above to get a chat inbox for incoming queries.
              </CardContent>
            </Card>
          )}
        </TabsPanel>
      </Tabs>
    </div>
  );
}
