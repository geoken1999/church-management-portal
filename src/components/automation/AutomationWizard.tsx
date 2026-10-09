"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import {
  updateAutomationAction,
  upsertAutomationTriggerAction,
  deleteAutomationTriggerAction,
  upsertAutomationDestinationAction,
} from "@/lib/automations/actions";
import { MAX_DIGEST_LEADERS } from "@/lib/automations/date-logic";
import { MEMBER_VARIABLE_FIELDS } from "@/lib/automations/template-mapping";
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

export interface LeaderOption {
  id: string;
  name: string;
  title: string | null;
  hasPhone: boolean;
}

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
  variableValues: Record<string, string>;
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
    variableValues: trigger.variable_values ?? {},
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
  const selectedTemplate = memberTemplates.find((t) => t.id === row.templateId);

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
        variableValues: Object.fromEntries(Object.entries(row.variableValues).filter(([, v]) => v !== "")),
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
          <Select value={row.templateId ?? "none"} onValueChange={(v) => onChange({ ...row, templateId: v === "none" ? null : v, variableValues: {}, saved: false })} disabled={!canWrite}>
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
      {selectedTemplate && selectedTemplate.variable_names.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">What fills each placeholder</Label>
          {selectedTemplate.variable_names.map((name) => {
            const source = row.variableValues[name] ?? (MEMBER_VARIABLE_FIELDS.some((f) => f.key === name) ? `field:${name}` : "");
            const isText = source.startsWith("text:");
            const setSource = (next: string) => onChange({ ...row, variableValues: { ...row.variableValues, [name]: next }, saved: false });
            return (
              <div key={name} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr_1fr]">
                <span className="text-sm font-medium">{`{{${name}}}`}</span>
                <Select value={isText ? "text" : source || "unset"} onValueChange={(v) => setSource(v === "text" ? "text:" : v === "unset" ? "" : (v ?? ""))} disabled={!canWrite}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {() => (isText ? "Custom text" : MEMBER_VARIABLE_FIELDS.find((f) => `field:${f.key}` === source)?.label ?? "Choose a value")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_VARIABLE_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={`field:${f.key}`}>
                        {f.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="text">Custom text</SelectItem>
                  </SelectContent>
                </Select>
                {isText && <Input value={source.slice(5)} onChange={(e) => setSource(`text:${e.target.value}`)} placeholder="Text to send" maxLength={200} disabled={!canWrite} />}
              </div>
            );
          })}
        </div>
      )}
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
  leaders,
  canWrite,
}: {
  organizationId: string;
  automation: Automation;
  initialTriggers: AutomationTrigger[];
  initialDestination: AutomationDestination[];
  dateFieldOptions: DateFieldOption[];
  templates: AutomationTemplate[];
  leaders: LeaderOption[];
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
  const [recipientLeaderIds, setRecipientLeaderIds] = useState<string[]>(digestDestination?.recipient_leader_ids ?? []);
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
      { fieldKey: dateFieldOptionKey(dateFieldOptions[0]), occasionLabel: "", daysOffset: 0, templateId: null, variableValues: {}, isActive: true, saved: false },
    ]);
  }

  function handleSaveDestinations() {
    setDestinationError(null);
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
        recipientLeaderIds,
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
                    <Label className="text-xs">Send the digest to (pick up to {MAX_DIGEST_LEADERS} leaders)</Label>
                    {leaders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No leaders yet. Add leaders first, then pick them here.</p>
                    ) : (
                      <div className="space-y-2">
                        {leaders.map((leader) => {
                          const checked = recipientLeaderIds.includes(leader.id);
                          return (
                            <label key={leader.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  setRecipientLeaderIds((prev) => (c === true ? [...prev, leader.id] : prev.filter((id) => id !== leader.id)));
                                  setDestinationSaved(false);
                                }}
                                disabled={!canWrite || (!checked && recipientLeaderIds.length >= MAX_DIGEST_LEADERS)}
                              />
                              <span>
                                {leader.name}
                                {leader.title ? <span className="text-muted-foreground"> · {leader.title}</span> : null}
                                {!leader.hasPhone ? <span className="text-destructive"> · no phone on file</span> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
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

      <div className="flex justify-between">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStepIndex((i) => i - 1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : (
          <span />
        )}
        {stepIndex < STEPS.length - 1 && (
          <Button type="button" onClick={() => setStepIndex((i) => i + 1)}>
            Next
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
