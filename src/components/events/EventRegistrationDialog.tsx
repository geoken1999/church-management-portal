"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ticket, Plus, Trash2, Copy, Check, CheckCircle2, Ban, ArrowUp, ArrowDown, Search } from "lucide-react";
import {
  enableEventRegistration,
  disableEventRegistration,
  updateEventRegistrationSettings,
  cancelEventRegistration,
  markRegistrationCheckedIn,
  fetchEventRegistrations,
  type RegistrationSettingsState,
} from "@/lib/events/registration-actions";
import { FORM_FIELD_TYPES, sanitizeRegistrationFields, isProtectedField, isTypeLockedField } from "@/lib/events/registration-validation";
import { slugifyFieldKey, validateFormField } from "@/lib/forms/validation";
import { QrCodeDialog } from "@/components/members/QrCodeDialog";
import { EventPassBackgroundUpload } from "@/components/events/EventPassBackgroundUpload";
import { EventPassPreview } from "@/components/events/EventPassPreview";
import type { Event, EventRegistration, EventRegistrationField, FormFieldType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";

const settingsInitialState: RegistrationSettingsState = {};

function uniqueKey(base: string, existing: Set<string>): string {
  let key = base || "field";
  let attempt = 1;
  while (existing.has(key)) {
    attempt += 1;
    key = `${base || "field"}_${attempt}`;
  }
  return key;
}

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FieldEditorRow({
  field,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  errors,
}: {
  field: EventRegistrationField;
  index: number;
  total: number;
  onChange: (field: EventRegistrationField) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  errors?: { label?: string; options?: string };
}) {
  const protectedField = isProtectedField(field);
  const typeLocked = isTypeLockedField(field);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
              <ArrowUp className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Field label</Label>
                <Input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} placeholder="Full name" aria-invalid={Boolean(errors?.label)} />
                <FieldError id={`field-${index}-label-error`} message={errors?.label} />
              </div>
              <div className="space-y-1.5">
                <Label>Field type</Label>
                <Select
                  value={field.field_type}
                  onValueChange={(v) => onChange({ ...field, field_type: (v ?? "text") as FormFieldType })}
                  disabled={typeLocked}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string | null) => FORM_FIELD_TYPES.find((t) => t.value === v)?.label ?? "Select a type"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeLocked && <p className="text-xs text-muted-foreground">Locked — the pass email and duplicate check depend on this type.</p>}
              </div>
            </div>

            {field.field_type === "select" && (
              <div className="space-y-1.5">
                <Label>Options (one per line)</Label>
                <Textarea
                  value={field.options?.join("\n") ?? ""}
                  onChange={(e) => onChange({ ...field, options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                  placeholder={"Adult\nChild"}
                  rows={3}
                  aria-invalid={Boolean(errors?.options)}
                />
                <FieldError id={`field-${index}-options-error`} message={errors?.options} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={protectedField ? true : field.required}
                  disabled={protectedField}
                  onCheckedChange={(checked) => onChange({ ...field, required: checked === true })}
                />
                Required
              </label>
              {!protectedField && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={field.unique ?? false} onCheckedChange={(checked) => onChange({ ...field, unique: checked === true })} />
                  No duplicates allowed
                </label>
              )}
            </div>
          </div>
          {protectedField ? (
            <div className="size-8" aria-hidden />
          ) : (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove field">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsTab({ event, siteUrl }: { event: Event; siteUrl: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<EventRegistrationField[]>(event.registration_fields);
  const [capacity, setCapacity] = useState(event.registration_capacity ? String(event.registration_capacity) : "");
  const [closesAt, setClosesAt] = useState(toDateTimeLocalValue(event.registration_closes_at));
  const [passColor, setPassColor] = useState(event.registration_pass_color);
  const [passMessage, setPassMessage] = useState(event.registration_pass_message ?? "");
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState(event.registration_pass_background_url);
  const [state, setState] = useState<RegistrationSettingsState>(settingsInitialState);
  const [fieldErrors, setFieldErrors] = useState<Record<number, { label?: string; options?: string }>>({});
  const [pending, startTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const registrationUrl = `${siteUrl}/events/register/${event.registration_share_token}`;

  function addField() {
    const existing = new Set(fields.map((f) => f.key));
    setFields([...fields, { key: uniqueKey("field", existing), label: "", field_type: "text", options: null, required: false, unique: false }]);
  }

  function updateField(index: number, next: EventRegistrationField) {
    setFields(fields.map((f, i) => (i === index ? next : f)));
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  function handleSubmit(formData: FormData) {
    const seenKeys = new Set<string>();
    const nextFieldErrors: Record<number, { label?: string; options?: string }> = {};
    let hasErrors = false;

    const finalFields = fields.map((field, index) => {
      const errors = validateFormField({ label: field.label, fieldType: field.field_type, options: field.options ?? [] });
      if (Object.values(errors).some(Boolean)) {
        nextFieldErrors[index] = errors;
        hasErrors = true;
      }
      const key = uniqueKey(slugifyFieldKey(field.label) || field.key, seenKeys);
      seenKeys.add(key);
      return { ...field, key };
    });

    setFieldErrors(nextFieldErrors);
    if (hasErrors) return;

    setFields(sanitizeRegistrationFields(finalFields));
    formData.set("fields", JSON.stringify(finalFields));

    startTransition(async () => {
      const result = await updateEventRegistrationSettings(state, formData);
      setState(result);
      if (result.success) router.refresh();
    });
  }

  function handleDisable() {
    startToggleTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", event.id);
      await disableEventRegistration(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Share link</p>
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              <code>{registrationUrl}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                navigator.clipboard.writeText(registrationUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Copy link"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <QrCodeDialog link={registrationUrl} title={event.title} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <EventPassBackgroundUpload
            eventId={event.id}
            backgroundUrl={event.registration_pass_background_url}
            passColor={passColor}
            onChange={setBackgroundPreviewUrl}
          />
          <EventPassPreview
            eventTitle={event.title}
            startAt={event.start_at}
            locationLabel={event.meeting_mode === "online" ? "Online" : "In person"}
            passColor={passColor}
            passMessage={passMessage}
            backgroundUrl={backgroundPreviewUrl}
          />
        </CardContent>
      </Card>

      <form action={handleSubmit} className="space-y-6">
        <input type="hidden" name="eventId" value={event.id} />
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.fieldErrors?.fields && (
          <Alert variant="destructive">
            <AlertDescription>{state.fieldErrors.fields}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capacity">Capacity (optional)</Label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Unlimited"
              aria-invalid={Boolean(state.fieldErrors?.capacity)}
            />
            <FieldError id="capacity-error" message={state.fieldErrors?.capacity} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closesAt">Registration closes (optional)</Label>
            <Input
              id="closesAt"
              name="closesAt"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.closesAt)}
            />
            <FieldError id="closesAt-error" message={state.fieldErrors?.closesAt} />
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border p-4">
          <p className="text-sm font-medium">Pass color &amp; message</p>
          <p className="text-xs text-muted-foreground">
            Used with the banner image above on the confirmation email sent to each registrant, alongside their QR code and calendar invite.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="passColor">Pass color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={passColor}
                  onChange={(e) => setPassColor(e.target.value)}
                  className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
                  aria-label="Pass color picker"
                />
                <Input
                  id="passColor"
                  name="passColor"
                  value={passColor}
                  onChange={(e) => setPassColor(e.target.value)}
                  aria-invalid={Boolean(state.fieldErrors?.passColor)}
                />
              </div>
              <FieldError id="passColor-error" message={state.fieldErrors?.passColor} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passMessage">Personal message (optional)</Label>
              <Textarea
                id="passMessage"
                name="passMessage"
                value={passMessage}
                onChange={(e) => setPassMessage(e.target.value)}
                placeholder="Can't wait to see you there!"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Form fields</Label>
          {fields.map((field, index) => (
            <FieldEditorRow
              key={index}
              field={field}
              index={index}
              total={fields.length}
              onChange={(next) => updateField(index, next)}
              onRemove={() => removeField(index)}
              onMove={(direction) => moveField(index, direction)}
              errors={fieldErrors[index]}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addField}>
              <Plus className="size-4" />
              Add field
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
          <Button type="button" variant="ghost" className="text-destructive" disabled={togglePending} onClick={handleDisable}>
            Disable registration
          </Button>
        </div>
      </form>
    </div>
  );
}

type RegistrationRow = EventRegistration;

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "secondary",
  checked_in: "default",
  cancelled: "outline",
};

function RegistrantsTab({ eventId, fields }: { eventId: string; fields: EventRegistrationField[] }) {
  const router = useRouter();
  // null means "not loaded yet" — this dialog is created fresh per event
  // (EventCard renders one per row, keyed by event.id), so eventId never
  // changes under a mounted instance; there's no "loading again for a
  // different event" case to reset back to null for.
  const [registrations, setRegistrations] = useState<RegistrationRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const loading = registrations === null;

  const filtered = useMemo(() => {
    if (!registrations) return [];
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => {
      if (r.email.toLowerCase().includes(q)) return true;
      if (r.phone?.toLowerCase().includes(q)) return true;
      if (r.confirmation_code.toLowerCase().includes(q)) return true;
      // Covers the registrant's name and any other custom field answer —
      // there's no dedicated "name" column on event_registrations (see
      // registration-validation.ts), it's just another key in answers.
      return Object.values(r.answers).some((value) => typeof value === "string" && value.toLowerCase().includes(q));
    });
  }, [registrations, query]);

  useEffect(() => {
    let cancelled = false;
    fetchEventRegistrations(eventId).then((rows) => {
      if (!cancelled) setRegistrations(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function runAction(action: (formData: FormData) => Promise<void>, registrationId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("registrationId", registrationId);
      formData.set("eventId", eventId);
      await action(formData);
      router.refresh();
      const rows = await fetchEventRegistrations(eventId);
      setRegistrations(rows);
    });
  }

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>;
  }

  if (!registrations || registrations.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No one has registered yet.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, phone, or code"
          className="pl-9"
          aria-label="Search registrants"
        />
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No registrants match &quot;{query}&quot;.</p>
      )}

      {filtered.map((registration) => (
        <Card key={registration.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{registration.email}</p>
                <Badge variant={STATUS_VARIANTS[registration.status]} className="capitalize">
                  {registration.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{registration.confirmation_code}</p>
              {fields
                .filter((f) => f.field_type !== "email")
                .map((f) => {
                  const value = registration.answers[f.key];
                  if (value === undefined || value === null || value === "") return null;
                  return (
                    <p key={f.key} className="text-xs text-muted-foreground">
                      <span className="font-medium">{f.label}:</span> {String(value)}
                    </p>
                  );
                })}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {registration.status !== "checked_in" && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => runAction(markRegistrationCheckedIn, registration.id)}>
                  <CheckCircle2 className="size-3.5" />
                  Check in
                </Button>
              )}
              {registration.status !== "cancelled" && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => runAction(cancelEventRegistration, registration.id)}>
                  <Ban className="size-3.5" />
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EventRegistrationDialog({ event, siteUrl }: { event: Event; siteUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabling, startEnabling] = useTransition();

  function handleEnable() {
    startEnabling(async () => {
      await enableEventRegistration(event.id);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Ticket className="size-3.5" />
            Registration
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registration — {event.title}</DialogTitle>
          <DialogDescription>
            {event.registration_enabled ? "Manage the form, share link, and registrants." : "Turn on a public registration form for this event."}
          </DialogDescription>
        </DialogHeader>

        {!event.registration_enabled ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Ticket className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Once enabled, visitors can register with a name/email (customizable), and each one gets an emailed pass
              with a QR code for check-in.
            </p>
            <Button type="button" disabled={enabling} onClick={handleEnable}>
              {enabling ? "Enabling..." : "Enable registration"}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="settings">
            <TabsList>
              <TabsIndicator />
              <TabsTab value="settings">Settings</TabsTab>
              <TabsTab value="registrants">Registrants</TabsTab>
            </TabsList>
            <TabsPanel value="settings">
              <SettingsTab event={event} siteUrl={siteUrl} />
            </TabsPanel>
            <TabsPanel value="registrants">
              <RegistrantsTab eventId={event.id} fields={event.registration_fields} />
            </TabsPanel>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
