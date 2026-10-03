"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  createAutomationTemplateAction,
  refreshAutomationTemplateStatusAction,
  deleteAutomationTemplateAction,
} from "@/lib/automations/template-actions";
import { extractVariableNames } from "@/lib/automations/template-mapping";
import type { AutomationTemplate, AutomationTemplateKind, WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

function statusBadge(status: WhatsAppTemplateStatus) {
  if (status === "approved") return <Badge variant="secondary">Approved</Badge>;
  if (status === "pending_review") return <Badge variant="outline">Pending review</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "disabled" || status === "paused") return <Badge variant="destructive">{status === "disabled" ? "Disabled" : "Paused"}</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

const KIND_VARIABLES: Record<AutomationTemplateKind, string> = {
  member_direct: "{{first_name}}, {{church_name}}, {{occasion_label}}",
  staff_digest: "{{celebrant_list}} (exactly this one variable)",
};

function NewAutomationTemplateForm({ organizationId, kind, onCreated }: { organizationId: string; kind: AutomationTemplateKind; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WhatsAppTemplateCategory>("utility");
  const [bodyText, setBodyText] = useState("");
  const [exampleValues, setExampleValues] = useState<Record<string, string>>({});

  const variableNames = extractVariableNames(bodyText);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createAutomationTemplateAction({
        organizationId,
        metaTemplateName: name,
        category,
        bodyTextNamed: bodyText,
        kind,
        exampleValues,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setName("");
      setBodyText("");
      setExampleValues({});
      onCreated?.();
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        New {kind === "staff_digest" ? "digest" : "message"} template
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New {kind === "staff_digest" ? "staff digest" : "member"} template</CardTitle>
        <CardDescription>
          Submitted to WhatsApp for review — approval usually takes a few minutes to a few hours, sometimes longer. Available variables:{" "}
          <code className="rounded bg-muted px-1 py-0.5">{KIND_VARIABLES[kind]}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="automation-template-name" className="text-xs">
              Name
            </Label>
            <Input
              id="automation-template-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="birthday_wishes"
              pattern="[a-z0-9_]+"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory((v ?? "utility") as WhatsAppTemplateCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => category.charAt(0).toUpperCase() + category.slice(1)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utility">Utility</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="automation-template-body" className="text-xs">
            Message
          </Label>
          <Textarea
            id="automation-template-body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={
              kind === "staff_digest"
                ? "🎉 Today's celebrations at {{church_name}}:\n\n{{celebrant_list}}"
                : "Happy Birthday, {{first_name}}! 🎉 From all of us at {{church_name}}."
            }
            rows={4}
          />
        </div>
        {variableNames.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Example values (shown to WhatsApp&apos;s reviewers)</Label>
            {variableNames.map((variableName) => (
              <Input
                key={variableName}
                value={exampleValues[variableName] ?? ""}
                onChange={(e) => setExampleValues((prev) => ({ ...prev, [variableName]: e.target.value }))}
                placeholder={`Example for {{${variableName}}}`}
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleSubmit} disabled={pending || !name.trim() || !bodyText.trim()}>
            {pending ? "Submitting..." : "Submit for review"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateRow({ template, canManage }: { template: AutomationTemplate; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshAutomationTemplateStatusAction(template.id);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete the "${template.meta_template_name}" template? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAutomationTemplateAction(template.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-1.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{template.meta_template_name}</span>
            {statusBadge(template.status)}
            <Badge variant="outline">{template.category}</Badge>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{template.body_text_named}</p>
          {template.status === "rejected" && template.rejected_reason && <p className="mt-1 text-xs text-destructive">Rejected: {template.rejected_reason}</p>}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {template.status === "pending_review" && (
              <Button type="button" size="icon" variant="ghost" onClick={handleRefresh} disabled={pending} title="Check for a status update">
                <RefreshCw className="size-4" />
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" onClick={handleDelete} disabled={pending} title="Delete template">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AutomationTemplateManager({
  organizationId,
  templates,
  kind,
  canManage,
  onCreated,
}: {
  organizationId: string;
  templates: AutomationTemplate[];
  kind: AutomationTemplateKind;
  canManage: boolean;
  onCreated?: () => void;
}) {
  const scoped = templates.filter((t) => t.kind === kind);

  return (
    <div className="space-y-4">
      {canManage && <NewAutomationTemplateForm organizationId={organizationId} kind={kind} onCreated={onCreated} />}
      <div className="divide-y divide-border">
        {scoped.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          scoped.map((template) => <TemplateRow key={template.id} template={template} canManage={canManage} />)
        )}
      </div>
    </div>
  );
}
