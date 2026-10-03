"use client";

import { useState, useTransition } from "react";
import { Sparkles, MessageCircle } from "lucide-react";
import { updateAiDataAccessRuleAction } from "@/lib/ai-rules/actions";
import type { AiDataAccessRules } from "@/lib/ai-rules/dal";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface RuleRow {
  key: keyof AiDataAccessRules;
  label: string;
  description: string;
  usedBy: "aura" | "shared";
}

// "aura" rows only ever affect Ask Aura's own tools (attendance/member/
// finance detail — internal, staff-only data no public-facing bot should
// ever see regardless of this setting). "shared" rows affect BOTH Ask
// Aura's tools and the Instagram/WhatsApp DM auto-reply's org-context —
// turning one off removes it from every AI feature at once.
const RULE_ROWS: RuleRow[] = [
  {
    key: "allowAttendance",
    label: "Attendance",
    description: "Who attended or missed a service, and headcounts per session.",
    usedBy: "aura",
  },
  {
    key: "allowMembers",
    label: "Members",
    description: "Member counts, optionally broken down by branch.",
    usedBy: "aura",
  },
  {
    key: "allowFinance",
    label: "Finance summary",
    description: "This month's offerings and donations totals.",
    usedBy: "aura",
  },
  {
    key: "allowFundraisers",
    label: "Fundraisers",
    description: "Fundraiser names, goals, and amounts raised.",
    usedBy: "shared",
  },
  {
    key: "allowEvents",
    label: "Events",
    description: "Upcoming events, including recurring ones.",
    usedBy: "shared",
  },
  {
    key: "allowMinistries",
    label: "Ministries",
    description: "Ministry names, vision, and mission statements.",
    usedBy: "shared",
  },
  {
    key: "allowBranches",
    label: "Branches & contacts",
    description: "Branch locations and their manager's published contact info.",
    usedBy: "shared",
  },
  {
    key: "allowForms",
    label: "Forms",
    description: "Public form names, descriptions, and links.",
    usedBy: "shared",
  },
];

function UsedByBadge({ usedBy }: { usedBy: RuleRow["usedBy"] }) {
  if (usedBy === "aura") {
    return (
      <Badge variant="outline" className="gap-1">
        <Sparkles className="size-3" />
        Ask Aura
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <MessageCircle className="size-3" />
      All AI features
    </Badge>
  );
}

function RuleToggle({ row, checked, canWrite }: { row: RuleRow; checked: boolean; canWrite: boolean }) {
  const [value, setValue] = useState(checked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: boolean) {
    setError(null);
    setValue(next);
    startTransition(async () => {
      const result = await updateAiDataAccessRuleAction(row.key, next);
      if (result.error) {
        setValue(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <label className={`flex flex-1 items-start gap-2.5 ${canWrite ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
        <Checkbox checked={value} onCheckedChange={(c) => handleChange(c === true)} disabled={!canWrite || pending} className="mt-0.5" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{row.label}</span>
            <UsedByBadge usedBy={row.usedBy} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </label>
    </div>
  );
}

export function AiRulesManager({ rules, canWrite }: { rules: AiDataAccessRules; canWrite: boolean }) {
  const auraRows = RULE_ROWS.filter((r) => r.usedBy === "aura");
  const sharedRows = RULE_ROWS.filter((r) => r.usedBy === "shared");

  return (
    <div className="space-y-6">
      {!canWrite && (
        <Alert>
          <AlertDescription>You can see these settings, but only an owner or admin can change them.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Ask Aura — internal data
          </CardTitle>
          <CardDescription>
            Staff-only categories, used by Ask Aura&apos;s chat tools. These never reach the Instagram or WhatsApp auto-reply, which talks to the public
            and is already restricted to non-personal data regardless of this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {auraRows.map((row) => (
            <RuleToggle key={row.key} row={row} checked={rules[row.key]} canWrite={canWrite} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" />
            Shared across AI features
          </CardTitle>
          <CardDescription>
            Used by Ask Aura and by the Instagram/WhatsApp DM auto-reply — turning one off removes it from every AI feature at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {sharedRows.map((row) => (
            <RuleToggle key={row.key} row={row} checked={rules[row.key]} canWrite={canWrite} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
