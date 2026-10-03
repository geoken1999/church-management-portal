"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  updateAutomationAction,
  upsertAutomationTriggerAction,
  deleteAutomationTriggerAction,
  upsertAutomationDestinationAction,
} from "@/lib/automations/actions";
import { AutomationTemplateManager } from "@/components/automation/AutomationTemplateManager";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import type {
  Automation,
  AutomationDestination,
  AutomationStatus,
  AutomationTemplate,
  AutomationTrigger,
} from "@/types/database";

export interface DateFieldOption {
  source: "built_in" | "custom_field";
  builtInField: "date_of_birth" | "wedding_date" | null;
  dateFieldId: string | null;
  label: string;
}

function dateFieldOptionKey(option: DateFieldOption): string {
  return option.source === "built_in" ? `built_in:${option.builtInField}` : `custom_field:${option.dateFieldId}`;
}

const STEPS = [
  { key: "basics", label: "Basics & triggers" },
  { key: "templates", label: "Templates" },
  { key: "destinations", label: "Destinations" },
  { key: "review", label: "Review & activate" },
];

interface TriggerRowState {
  id?: string;
  fieldKey: string;
  occasionLabel: string;
  daysOffset: number;
  templateId: string | null;
  isActive: boolean;
  saved: boolean;
}

function triggerToRowState(trigger: AutomationTrigger): TriggerRowState {
  const fieldKey = trigger.date_field_source === "built_in" ? `built_in:${trigger.built_in_field}` : `custom_field:${trigger.date_field_id}`;
  return {
    id: trigger.id,
    fieldKey,
    occasionLabel: trigger.occasion_label,
    daysOffset: trigger.days_offset,
    templateId: trigger.template_id,
    isActive: trigger.is_active,
    saved: true,
  };
}

function TriggerRow({
  row,
  dateFieldOptions,
  memberTemplates,
  automationId,
  canWrite,
  onChange,
  onRemove,
}: {
  row: TriggerRowState;
  dateFieldOptions: DateFieldOption[];
  memberTemplates: AutomationTemplate[];
  automationId: string;
  canWrite: boolean;
  onChange: (next: TriggerRowState) => void;
  onRemove: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const option = dateFieldOptions.find((o) => dateFieldOptionKey(o) === row.fieldKey);
    if (!option) {
      setError("Select a date field.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await upsertAutomationTriggerAction({
        id: row.id,
        automationId,
        dateFieldSource: option.source,
        builtInField: option.builtInField,
        dateFieldId: option.dateFieldId,
        occasionLabel: row.occasionLabel,
        daysOffset: row.daysOffset,
        templateId: row.templateId,
        isActive: row.isActive,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onChange({ ...row, id: result.id, saved: true });
    });
  }

  function handleDelete() {
    if (!row.id) {
      onRemove();
      return;
    }
    if (!window.confirm("Remove this trigger?")) return;
    startTransition(async () => {
      const result = await deleteAutomationTriggerAction(row.id!);
      if (result.error) {
        setError(result.error);
        return;
      }
      onRemove();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Date field</Label>
          <Select value={row.fieldKey} onValueChange={(v) => onChange({ ...row, fieldKey: v ?? row.fieldKey, saved: false })} disabled={!canWrite}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => dateFieldOptions.find((o) => dateFieldOptionKey(o) === row.fieldKey)?.label ?? "Select a date field"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dateFieldOptions.map((option) => (
                <SelectItem key={dateFieldOptionKey(option)} value={dateFieldOptionKey(option)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Occasion label</Label>
          <Input value={row.occasionLabel} onChange={(e) => onChange({ ...row, occasionLabel: e.target.value, saved: false })} placeholder="Birthday" disabled={!canWrite} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Days before (0 = on the day)</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={row.daysOffset}
            onChange={(e) => onChange({ ...row, daysOffset: Number(e.target.value) || 0, saved: false })}
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message template</Label>
          <Select value={row.templateId ?? "none"} onValueChange={(v) => onChange({ ...row, templateId: v === "none" ? null : v, saved: false })} disabled={!canWrite}>
            <SelectTrigger className="w-full">
              <SelectValue>{() => memberTemplates.find((t) => t.id === row.templateId)?.meta_template_name ?? "No template selected"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template selected</SelectItem>
              {memberTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.meta_template_name} ({template.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={row.isActive} onCheckedChange={(c) => onChange({ ...row, isActive: c === true, saved: false })} disabled={!canWrite} />
          Active
        </label>
        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={pending}>
              <Trash2 className="size-4" />
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={pending || row.saved}>
              {pending ? "Saving..." : row.saved ? "Saved" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function statusBadge(status: AutomationStatus) {
  if (status === "active") return <Badge variant="secondary">Active</Badge>;
  if (status === "paused") return <Badge variant="destructive">Paused</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function AutomationWizard({
  organizationId,
  automation,
  initialTriggers,
  initialDestination,
  dateFieldOptions,
  templates,
  canWrite,
}: {
  organizationId: string;
  automation: Automation;
  initialTriggers: AutomationTrigger[];
  initialDestination: AutomationDestination[];
  dateFieldOptions: DateFieldOption[];
  templates: AutomationTemplate[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(automation.name);
  const [triggers, setTriggers] = useState<TriggerRowState[]>(initialTriggers.map(triggerToRowState));
  const [namePending, startNameTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  const directDestination = initialDestination.find((d) => d.kind === "direct_member");
  const digestDestination = initialDestination.find((d) => d.kind === "staff_digest");
  const [directEnabled, setDirectEnabled] = useState(directDestination?.is_active ?? false);
  const [digestEnabled, setDigestEnabled] = useState(digestDestination?.is_active ?? false);
  const [digestTemplateId, setDigestTemplateId] = useState<string | null>(digestDestination?.digest_template_id ?? null);
  const [recipientPhonesText, setRecipientPhonesText] = useState((digestDestination?.recipient_phones ?? []).join("\n"));
  const [destinationPending, startDestinationTransition] = useTransition();
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [destinationSaved, setDestinationSaved] = useState(true);

  const [statusPending, startStatusTransition] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  const memberTemplates = templates.filter((t) => t.kind === "member_direct");
  const digestTemplates = templates.filter((t) => t.kind === "staff_digest");

  function handleSaveName() {
    setNameError(null);
    startNameTransition(async () => {
      const result = await updateAutomationAction({ id: automation.id, name });
      if (result.error) setNameError(result.error);
    });
  }

  function handleAddTrigger() {
    setTriggers((prev) => [
      ...prev,
      { fieldKey: dateFieldOptionKey(dateFieldOptions[0]), occasionLabel: "", daysOffset: 0, templateId: null, isActive: true, saved: false },
    ]);
  }

  function handleSaveDestinations() {
    setDestinationError(null);
    const recipientPhones = recipientPhonesText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    startDestinationTransition(async () => {
      const directResult = await upsertAutomationDestinationAction({ automationId: automation.id, kind: "direct_member", isActive: directEnabled });
      if (directResult.error) {
        setDestinationError(directResult.error);
        return;
      }
      const digestResult = await upsertAutomationDestinationAction({
        automationId: automation.id,
        kind: "staff_digest",
        isActive: digestEnabled,
        recipientPhones,
        digestTemplateId,
      });
      if (digestResult.error) {
        setDestinationError(digestResult.error);
        return;
      }
      setDestinationSaved(true);
    });
  }

  function handleSetStatus(status: AutomationStatus) {
    setStatusError(null);
    startStatusTransition(async () => {
      const result = await updateAutomationAction({ id: automation.id, status });
      if (result.error) {
        setStatusError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const hasApprovedDirectTemplate = triggers.some((t) => memberTemplates.find((m) => m.id === t.templateId && m.status === "approved"));
  const hasApprovedDigestTemplate = digestTemplates.find((t) => t.id === digestTemplateId && t.status === "approved");
  const readyToActivate = (directEnabled && hasApprovedDirectTemplate) || (digestEnabled && hasApprovedDigestTemplate);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <Stepper steps={STEPS} currentStepIndex={stepIndex} onStepClick={setStepIndex} />
        </CardContent>
      </Card>

      {stepIndex === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardDescription>Name this automation and define which date fields trigger it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {nameError && (
              <Alert variant="destructive">
                <AlertDescription>{nameError}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="automation-name">Name</Label>
                <Input id="automation-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
              </div>
              {canWrite && (
                <Button type="button" variant="outline" onClick={handleSaveName} disabled={namePending || name === automation.name}>
                  {namePending ? "Saving..." : "Save"}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <Label>Occasions to watch</Label>
              {triggers.map((row, index) => (
                <TriggerRow
                  key={row.id ?? `new-${index}`}
                  row={row}
                  dateFieldOptions={dateFieldOptions}
                  memberTemplates={memberTemplates}
                  automationId={automation.id}
                  canWrite={canWrite}
                  onChange={(next) => setTriggers((prev) => prev.map((r, i) => (i === index ? next : r)))}
                  onRemove={() => setTriggers((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
              {canWrite && (
                <Button type="button" variant="outline" size="sm" onClick={handleAddTrigger}>
                  <Plus className="size-4" />
                  Add another occasion
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {stepIndex === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Member messages</CardTitle>
              <CardDescription>
                Assign one of these to each occasion in the previous step. Meta&apos;s review can take minutes to days — an automation with a pending
                template won&apos;t send anything until it&apos;s approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutomationTemplateManager organizationId={organizationId} templates={templates} kind="member_direct" canManage={canWrite} onCreated={() => router.refresh()} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Staff digest</CardTitle>
              <CardDescription>Used only if you enable the staff digest destination in the next step.</CardDescription>
            </CardHeader>
            <CardContent>
              <AutomationTemplateManager organizationId={organizationId} templates={templates} kind="staff_digest" canManage={canWrite} onCreated={() => router.refresh()} />
            </CardContent>
          </Card>
        </div>
      )}

      {stepIndex === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Destinations</CardTitle>
            <CardDescription>WhatsApp groups aren&apos;t possible with this integration — choose who actually receives a message instead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {destinationError && (
              <Alert variant="destructive">
                <AlertDescription>{destinationError}</AlertDescription>
              </Alert>
            )}
            <label className="flex items-start gap-2">
              <Checkbox
                checked={directEnabled}
                onCheckedChange={(c) => {
                  setDirectEnabled(c === true);
                  setDestinationSaved(false);
                }}
                disabled={!canWrite}
              />
              <span className="text-sm">
                <span className="font-medium">Message each member directly</span>
                <br />
                <span className="text-muted-foreground">Each celebrated member gets their own personal WhatsApp message.</span>
              </span>
            </label>

            <div className="space-y-3">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={digestEnabled}
                  onCheckedChange={(c) => {
                    setDigestEnabled(c === true);
                    setDestinationSaved(false);
                  }}
                  disabled={!canWrite}
                />
                <span className="text-sm">
                  <span className="font-medium">Send a daily digest to staff</span>
                  <br />
                  <span className="text-muted-foreground">One message listing everyone celebrating that day, sent to the numbers below.</span>
                </span>
              </label>
              {digestEnabled && (
                <div className="ml-6 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Digest template</Label>
                    <Select
                      value={digestTemplateId ?? "none"}
                      onValueChange={(v) => {
                        setDigestTemplateId(v === "none" ? null : v);
                        setDestinationSaved(false);
                      }}
                      disabled={!canWrite}
                    >
                      <SelectTrigger className="w-full sm:w-80">
                        <SelectValue>{() => digestTemplates.find((t) => t.id === digestTemplateId)?.meta_template_name ?? "No template selected"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template selected</SelectItem>
                        {digestTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.meta_template_name} ({template.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Staff WhatsApp numbers (one per line, E.164 e.g. +15551234567)</Label>
                    <textarea
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs sm:w-80"
                      rows={4}
                      value={recipientPhonesText}
                      onChange={(e) => {
                        setRecipientPhonesText(e.target.value);
                        setDestinationSaved(false);
                      }}
                      disabled={!canWrite}
                    />
                  </div>
                </div>
              )}
            </div>

            {canWrite && (
              <Button type="button" onClick={handleSaveDestinations} disabled={destinationPending || destinationSaved}>
                {destinationPending ? "Saving..." : destinationSaved ? "Saved" : "Save destinations"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {stepIndex === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & activate</CardTitle>
            <CardDescription>Nothing sends until this automation&apos;s status is Active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusError && (
              <Alert variant="destructive">
                <AlertDescription>{statusError}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              {statusBadge(automation.status)}
            </div>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>{triggers.length} occasion(s) configured</li>
              <li>Direct member messages: {directEnabled ? "enabled" : "disabled"}</li>
              <li>Staff digest: {digestEnabled ? "enabled" : "disabled"}</li>
            </ul>
            {!readyToActivate && (
              <Alert>
                <AlertDescription>
                  This automation won&apos;t send anything yet — enable at least one destination with an approved template attached.
                </AlertDescription>
              </Alert>
            )}
            {canWrite && (
              <div className="flex gap-2">
                {automation.status !== "active" ? (
                  <Button type="button" onClick={() => handleSetStatus("active")} disabled={statusPending || !readyToActivate}>
                    Activate
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => handleSetStatus("paused")} disabled={statusPending}>
                    Pause
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
