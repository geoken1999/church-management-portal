"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquareText, Search, Send, TriangleAlert } from "lucide-react";
import { sendBulkSmsAction } from "@/lib/sms/actions";
import { getSmsSegmentInfo, normalizePhoneNumber } from "@/lib/sms/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export interface SmsRecipientOption {
  id: string;
  name: string;
  phone: string;
  // Resolved from the member's branch, falling back to the org's country
  // — null means neither is set, so this number can't be normalized yet.
  countryCode: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface SmsBranchOption {
  id: string;
  name: string;
}

export interface SmsCampaignRow {
  id: string;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { phone: string; error: string }[];
  status: "sent" | "partial_failure" | "failed";
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
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
// Recipient picker (mirrors the Email composer's picker, phone instead of email)
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
  members: SmsRecipientOption[];
  branches: SmsBranchOption[];
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or phone"
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
          className={disabled ? "flex cursor-not-allowed items-center gap-2 border-b border-border px-3 py-2 text-sm opacity-50" : "flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm"}
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
                className={
                  disabled
                    ? "flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm opacity-50"
                    : "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                }
              >
                <Checkbox
                  checked={selectedIds.has(member.id)}
                  onCheckedChange={() => onToggle(member.id)}
                  aria-label={`Select ${member.name}`}
                  disabled={disabled}
                />
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
        <Label htmlFor="sms-extra-numbers">Additional phone numbers</Label>
        <Textarea
          id="sms-extra-numbers"
          value={extraNumbers}
          onChange={(e) => onExtraNumbersChange(e.target.value)}
          placeholder="One per line or comma-separated — for people who aren't members"
          rows={2}
          disabled={disabled}
        />
        {extraCount > 0 && <p className="text-xs text-muted-foreground">{extraCount} valid extra number{extraCount === 1 ? "" : "s"}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({
  members,
  branches,
  disabled,
  smsRemaining,
  orgCountryCode,
}: {
  members: SmsRecipientOption[];
  branches: SmsBranchOption[];
  disabled: boolean;
  smsRemaining: number;
  orgCountryCode: string | null;
}) {
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraNumbers, setExtraNumbers] = useState("");
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const extraCount = parseExtraNumbers(extraNumbers, orgCountryCode).length;
  const totalRecipients = selectedIds.size + extraCount;
  const segmentInfo = getSmsSegmentInfo(body);

  const selectedWithoutCountry = Array.from(selectedIds)
    .map((id) => membersById.get(id))
    .filter((m): m is SmsRecipientOption => Boolean(m && !m.countryCode));

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
      setResult({
        error: `${selectedWithoutCountry.length} selected recipient${selectedWithoutCountry.length === 1 ? " has" : "s have"} no country set (via their branch or your Church Profile), so their number can't be sent to yet.`,
      });
      return;
    }

    const recipients = [
      ...Array.from(selectedIds)
        .map((id) => membersById.get(id))
        .filter((m): m is SmsRecipientOption => Boolean(m))
        .map((m) => ({ phone: m.phone, countryCode: m.countryCode })),
      ...parseExtraNumbers(extraNumbers, orgCountryCode).map((phone) => ({ phone, countryCode: orgCountryCode })),
    ];

    const formData = new FormData();
    formData.set("body", body);
    formData.set("recipients", JSON.stringify(recipients));

    startTransition(async () => {
      const response = await sendBulkSmsAction(formData);
      if (response.error) {
        setResult({ error: response.error });
        return;
      }
      setResult({
        success: `Sent to ${response.sentCount} recipient${response.sentCount === 1 ? "" : "s"}${
          response.failedCount ? ` (${response.failedCount} failed)` : ""
        }.`,
      });
      setBody("");
      setSelectedIds(new Set());
      setExtraNumbers("");
    });
  }

  const canSend =
    !disabled && body.trim().length > 0 && totalRecipients > 0 && selectedWithoutCountry.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-primary" />
          Compose
          {disabled ? <Badge variant="destructive">Offline</Badge> : <Badge variant="secondary">Online</Badge>}
        </CardTitle>
        <CardDescription>Send a text announcement or reminder to your congregation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabled && (
          <Alert variant="destructive">
            <AlertDescription>
              SMS sending is offline — either the shared provider isn&apos;t configured, or your Basic plan&apos;s
              monthly SMS limit has been reached. Ask your developer to configure Twilio, or upgrade your plan.
            </AlertDescription>
          </Alert>
        )}
        {!disabled && smsRemaining <= 20 && (
          <Alert>
            <AlertDescription>
              {smsRemaining.toLocaleString()} SMS left this month on your Basic plan.
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
        {members.some((m) => !m.countryCode) && (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <TriangleAlert className="size-3.5" />
              <span>
                Some members have no country set (via their branch or your Church Profile), so their number can&apos;t
                be sent to yet.
              </span>
              <Link href="/dashboard/profile" className="font-medium text-primary underline">
                Set your church&apos;s country
              </Link>
              <span>or</span>
              <Link href="/dashboard/branches" className="font-medium text-primary underline">
                set it per branch
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="sms-body">Message</Label>
          <Textarea
            id="sms-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="This Sunday's service starts at 10am. See you there!"
            rows={4}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {segmentInfo.length} character{segmentInfo.length === 1 ? "" : "s"} · {segmentInfo.encoding} ·{" "}
            {segmentInfo.segments} segment{segmentInfo.segments === 1 ? "" : "s"}
            {segmentInfo.encoding === "UCS-2" && " (emoji/accents drop the per-segment limit to 70 characters)"}
          </p>
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
            extraNumbers={extraNumbers}
            onExtraNumbersChange={setExtraNumbers}
            orgCountryCode={orgCountryCode}
          />
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

function statusBadge(status: SmsCampaignRow["status"]) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "partial_failure") return <Badge variant="outline">Partially sent</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

function SmsHistory({ campaigns }: { campaigns: SmsCampaignRow[] }) {
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
                    {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                    {campaign.sent_count}/{campaign.recipient_count} delivered
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
// Root
// ---------------------------------------------------------------------------

export function SmsManager({
  canSend,
  smsAvailable,
  smsRemaining,
  members,
  branches,
  campaigns,
  orgCountryCode,
}: {
  canSend: boolean;
  smsAvailable: boolean;
  smsRemaining: number;
  members: SmsRecipientOption[];
  branches: SmsBranchOption[];
  campaigns: SmsCampaignRow[];
  orgCountryCode: string | null;
}) {
  return (
    <div className="space-y-6">
      {canSend ? (
        <Composer
          members={members}
          branches={branches}
          disabled={!smsAvailable}
          smsRemaining={smsRemaining}
          orgCountryCode={orgCountryCode}
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            You don&apos;t have permission to send SMS. You can still view what&apos;s been sent below.
          </CardContent>
        </Card>
      )}
      <SmsHistory campaigns={campaigns} />
    </div>
  );
}
