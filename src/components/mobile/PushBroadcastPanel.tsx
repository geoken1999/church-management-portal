"use client";

import { matchesPerson } from "@/lib/people/search";
import { useState, useTransition } from "react";
import { sendBroadcastAction } from "@/lib/push/broadcast-actions";
import { schedulePushAction } from "@/lib/scheduler/actions";
import { SchedulePicker } from "@/components/scheduler/SchedulePicker";
import { ScheduledCampaigns } from "@/components/scheduler/ScheduledCampaigns";
import type { ScheduledCampaign } from "@/types/database";
import { BUTTON_PRESETS } from "@/lib/push/button-presets";
import { GROUP_KEYS, GROUP_LABELS, type GroupKey } from "@/lib/groups/shares";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

export interface RecipientOption {
  id: string;
  name: string;
  phone?: string | null;
}

export interface BroadcastHistoryRow {
  id: string;
  audience: "church" | "branch" | "group" | "member";
  group_key: GroupKey | null;
  title: string;
  body: string;
  recipient_count: number;
  created_at: string;
}

function audienceLabel(row: BroadcastHistoryRow): string {
  if (row.audience === "church") return "Whole church";
  if (row.audience === "branch") return "A branch";
  if (row.audience === "group" && row.group_key) return GROUP_LABELS[row.group_key];
  return "One member";
}

// How many people with the app each audience would reach right now.
export interface AudienceCounts {
  church: number;
  groups: Record<GroupKey, number>;
  branches: Record<string, number>;
}

function reach(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"} with the app`;
}

export function PushBroadcastPanel({
  recipients,
  history,
  branches,
  counts,
  scheduled,
  timezone,
}: {
  recipients: RecipientOption[];
  history: BroadcastHistoryRow[];
  branches: { id: string; name: string }[];
  counts: AudienceCounts;
  scheduled: ScheduledCampaign[];
  timezone: string;
}) {
  const [audience, setAudience] = useState<"church" | "branch" | "group" | "member">("church");
  const [branchId, setBranchId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [groupKey, setGroupKey] = useState<GroupKey | "">("");
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = search.trim() ? recipients.filter((r) => matchesPerson(search, r)).slice(0, 8) : [];

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (audience === "group" && !groupKey) {
        setError("Choose which group to send to.");
        return;
      }
      if (audience === "branch" && !branchId) {
        setError("Choose which branch to send to.");
        return;
      }
      if (audience === "member" && !memberId) {
        setError("Search for a member and pick them from the list.");
        return;
      }
      if (scheduleAt) {
        const scheduledResult = await schedulePushAction({ audienceType: audience, groupKey, memberId, branchId, title, body, linkUrl, buttonLabel, scheduledAt: scheduleAt });
        if (scheduledResult.error) {
          setError(scheduledResult.error);
          return;
        }
        setNotice(`Scheduled for ${scheduledResult.scheduledLabel}. It goes out within 5 minutes of that time; you can cancel it below until then.`);
        setScheduleAt(null);
        setTitle("");
        setBody("");
        setLinkUrl("");
        setButtonLabel("");
        return;
      }
      const result = await sendBroadcastAction(audience, groupKey, memberId, title, body, branchId, linkUrl, buttonLabel);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}.`);
      setTitle("");
      setBody("");
      setLinkUrl("");
      setButtonLabel("");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <ErrorToast message={error} />
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Send to</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["church", "Whole church"],
                    ...(branches.length > 0 ? ([["branch", "A branch"]] as const) : []),
                    ["group", "A group"],
                    ["member", "One member"],
                  ] as const
                ).map(([value, label]) => (
                  <Button key={value} type="button" size="sm" variant={audience === value ? "default" : "outline"} aria-pressed={audience === value} onClick={() => setAudience(value)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {audience === "church" && <p className="text-xs text-muted-foreground">{reach(counts.church)}.</p>}

            {audience === "branch" && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  {branches.map((branch) => (
                    <Button key={branch.id} type="button" size="sm" variant={branchId === branch.id ? "default" : "outline"} aria-pressed={branchId === branch.id} onClick={() => setBranchId(branch.id)}>
                      {branch.name} ({counts.branches[branch.id] ?? 0})
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{branchId ? `${reach(counts.branches[branchId] ?? 0)} in this branch.` : "Choose a branch. The number is how many people with the app are in it."}</p>
              </div>
            )}

            {audience === "group" && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  {GROUP_KEYS.map((key) => (
                    <Button key={key} type="button" size="sm" variant={groupKey === key ? "default" : "outline"} aria-pressed={groupKey === key} onClick={() => setGroupKey(key)}>
                      {GROUP_LABELS[key]} ({counts.groups[key] ?? 0})
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {groupKey
                    ? counts.groups[groupKey] > 0
                      ? `${reach(counts.groups[groupKey])} in ${GROUP_LABELS[groupKey]}.`
                      : `Nobody in ${GROUP_LABELS[groupKey]} has the app yet. Add members to this group, and they need to sign in to the app to get notifications.`
                    : "Choose a group. The number is how many of its members have the app."}
                </p>
              </div>
            )}

            {audience === "member" && (
              <div className="space-y-1.5">
                <Label htmlFor="push-member-search" className="text-xs">
                  Member (only people who use the app)
                </Label>
                <Input
                  id="push-member-search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setMemberId("");
                  }}
                  placeholder="Search by name"
                />
                {matches.length > 0 && !memberId && (
                  <div className="rounded-md border border-border">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setMemberId(m.id);
                          setSearch(m.name);
                        }}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="push-title" className="text-xs">
                Title
              </Label>
              <Input id="push-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Sunday service moved to 9 AM" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-body" className="text-xs">
                Message
              </Label>
              <Textarea id="push-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={240} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-link" className="text-xs">
                Link (optional, https://…)
              </Label>
              <Input id="push-link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://meet.example.com/service" />
              <p className="text-xs text-muted-foreground">Tapping the notification opens this link on the member&apos;s phone.</p>
            </div>
            {linkUrl.trim() && (
              <div className="space-y-1.5">
                <Label htmlFor="push-button" className="text-xs">
                  Button text (optional)
                </Label>
                <Input id="push-button" value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} maxLength={24} placeholder="Join" />
                <div className="flex flex-wrap gap-1.5">
                  {BUTTON_PRESETS.map((preset) => (
                    <Button key={preset} type="button" size="xs" variant={buttonLabel === preset ? "secondary" : "outline"} onClick={() => setButtonLabel(preset)}>
                      {preset}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  The button sits on the notification and opens the link. Android shows your text; iPhones show the matching standard button above (or &quot;Open&quot;).
                </p>
              </div>
            )}
            <SchedulePicker value={scheduleAt} onChange={setScheduleAt} disabled={pending} />
            <Button type="submit" disabled={pending}>
              {pending ? (scheduleAt ? "Scheduling..." : "Sending...") : scheduleAt ? "Schedule notification" : "Send notification"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ScheduledCampaigns items={scheduled} timezone={timezone} />

      <div className="space-y-2">
        <p className="font-medium">Recently sent</p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {history.map((row) => (
              <div key={row.id} className="px-3 py-2">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-sm text-muted-foreground">{row.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {audienceLabel(row)} · {row.recipient_count} {row.recipient_count === 1 ? "person" : "people"} · {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
