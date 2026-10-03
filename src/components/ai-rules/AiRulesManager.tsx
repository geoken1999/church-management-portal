"use client";

import { useState, useTransition } from "react";
import { Sparkles, MessageCircle } from "lucide-react";
import { updateAiDataAccessRuleAction } from "@/lib/ai-rules/actions";
import type { AiDataAccessRules } from "@/lib/ai-rules/dal";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface RuleRow {
  label: string;
  description: string;
  // Each column is optional per row — Attendance/Members/Finance have no
  // Instagram/WhatsApp equivalent (deliberately excluded there for
  // privacy, regardless of this page), and Ministries/Branches/Forms have
  // no Ask Aura tool to gate in the first place.
  aura?: keyof AiDataAccessRules;
  instagram?: keyof AiDataAccessRules;
  whatsapp?: keyof AiDataAccessRules;
}

const RULE_ROWS: RuleRow[] = [
  { label: "Attendance", description: "Who attended or missed a service, and headcounts per session.", aura: "allowAttendance" },
  { label: "Members", description: "Member counts, optionally broken down by branch.", aura: "allowMembers" },
  { label: "Finance summary", description: "This month's offerings and donations totals.", aura: "allowFinance" },
  {
    label: "Fundraisers",
    description: "Fundraiser names, goals, and amounts raised.",
    aura: "allowFundraisers",
    instagram: "allowFundraisersInstagram",
    whatsapp: "allowFundraisersWhatsapp",
  },
  {
    label: "Events",
    description: "Upcoming events, including recurring ones.",
    aura: "allowEvents",
    instagram: "allowEventsInstagram",
    whatsapp: "allowEventsWhatsapp",
  },
  {
    label: "Ministries",
    description: "Ministry names, vision, and mission statements.",
    instagram: "allowMinistriesInstagram",
    whatsapp: "allowMinistriesWhatsapp",
  },
  {
    label: "Branches & contacts",
    description: "Branch locations and their manager's published contact info.",
    instagram: "allowBranchesInstagram",
    whatsapp: "allowBranchesWhatsapp",
  },
  {
    label: "Forms",
    description: "Public form names, descriptions, and links.",
    instagram: "allowFormsInstagram",
    whatsapp: "allowFormsWhatsapp",
  },
];

function RuleCell({ ruleKey, checked, canWrite }: { ruleKey?: keyof AiDataAccessRules; checked: boolean; canWrite: boolean }) {
  const [value, setValue] = useState(checked);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!ruleKey) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  function handleChange(next: boolean) {
    setError(null);
    setValue(next);
    startTransition(async () => {
      const result = await updateAiDataAccessRuleAction(ruleKey as keyof AiDataAccessRules, next);
      if (result.error) {
        setValue(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Checkbox checked={value} onCheckedChange={(c) => handleChange(c === true)} disabled={!canWrite} />
      {error && <span className="text-[10px] text-destructive">Failed</span>}
    </div>
  );
}

function ColumnHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-xs font-medium text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}

export function AiRulesManager({ rules, canWrite }: { rules: AiDataAccessRules; canWrite: boolean }) {
  return (
    <div className="space-y-6">
      {!canWrite && (
        <Alert>
          <AlertDescription>You can see these settings, but only an owner or admin can change them.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Data categories</CardTitle>
          <CardDescription>
            Choose which data each AI feature can use. Ask Aura is your internal staff chat tool; Instagram and WhatsApp auto-reply talk to the public and
            are controlled independently of each other — share fundraisers over WhatsApp but not Instagram, for example.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 gap-y-1 px-4 pb-2 sm:grid-cols-[1fr_repeat(3,5.5rem)]">
            <span />
            <ColumnHeader icon={<Sparkles className="size-4 text-primary" />} label="Ask Aura" />
            <ColumnHeader icon={<InstagramIcon className="size-4" />} label="Instagram" />
            <ColumnHeader icon={<MessageCircle className="size-4" />} label="WhatsApp" />
          </div>
          <div className="divide-y divide-border border-t border-border">
            {RULE_ROWS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 px-4 py-3 sm:grid-cols-[1fr_repeat(3,5.5rem)]"
              >
                <div>
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
                <div className="flex justify-center">
                  <RuleCell ruleKey={row.aura} checked={row.aura ? rules[row.aura] : false} canWrite={canWrite} />
                </div>
                <div className="flex justify-center">
                  <RuleCell ruleKey={row.instagram} checked={row.instagram ? rules[row.instagram] : false} canWrite={canWrite} />
                </div>
                <div className="flex justify-center">
                  <RuleCell ruleKey={row.whatsapp} checked={row.whatsapp ? rules[row.whatsapp] : false} canWrite={canWrite} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
