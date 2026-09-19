"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Settings } from "lucide-react";
import {
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  type FieldDefinitionState,
} from "@/lib/members/actions";
import { FIELD_TYPE_OPTIONS } from "@/lib/members/validation";
import type { MemberFieldDefinition } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: FieldDefinitionState = {};

function FieldForm({
  field,
  fieldType,
  onFieldTypeChange,
  errors,
}: {
  field?: MemberFieldDefinition;
  fieldType: string;
  onFieldTypeChange: (value: string) => void;
  errors?: FieldDefinitionState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="label">Field label</Label>
        <Input
          id="label"
          name="label"
          defaultValue={field?.label}
          placeholder="Baptism date"
          required
          aria-invalid={Boolean(errors?.label)}
          aria-describedby={errors?.label ? "label-error" : undefined}
        />
        <FieldError id="label-error" message={errors?.label} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fieldType">Field type</Label>
        <input type="hidden" name="fieldType" value={fieldType} />
        <Select value={fieldType} onValueChange={(v) => onFieldTypeChange(v ?? "text")} disabled={Boolean(field)}>
          <SelectTrigger id="fieldType" className="w-full">
            <SelectValue placeholder="Select a type">
              {(value: string | null) =>
                FIELD_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "Select a type"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field && <p className="text-xs text-muted-foreground">Field type can&apos;t be changed after creation.</p>}
      </div>

      {fieldType === "select" && (
        <div className="space-y-2">
          <Label htmlFor="options">Options (one per line)</Label>
          <Textarea
            id="options"
            name="options"
            defaultValue={field?.options?.join("\n") ?? ""}
            placeholder={"Member\nVisitor\nVolunteer"}
            aria-invalid={Boolean(errors?.options)}
            aria-describedby={errors?.options ? "options-error" : undefined}
          />
          <FieldError id="options-error" message={errors?.options} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="required" defaultChecked={field?.required} />
        Required field
      </label>
    </div>
  );
}

function AddFieldDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<FieldDefinitionState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [fieldType, setFieldType] = useState("text");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createFieldDefinition(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialState);
          setFieldType("text");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Plus className="size-4" />
            Add field
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a field</DialogTitle>
          <DialogDescription>Capture something extra on every member record.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FieldForm fieldType={fieldType} onFieldTypeChange={setFieldType} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFieldDialog({ field }: { field: MemberFieldDefinition }) {
  const [state, setState] = useState<FieldDefinitionState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [fieldType, setFieldType] = useState<string>(field.field_type);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFieldDefinition(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(initialState);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit field">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit field</DialogTitle>
          <DialogDescription>Update this field&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="fieldId" value={field.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FieldForm field={field} fieldType={fieldType} onFieldTypeChange={setFieldType} errors={state.fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FieldDefinitionsManager({
  organizationId,
  definitions,
}: {
  organizationId: string;
  definitions: MemberFieldDefinition[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Settings className="size-4" />
            Customize fields
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize member form</DialogTitle>
          <DialogDescription>
            Add extra fields to capture on every member, beyond name, email, and phone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {definitions.length === 0 && (
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
          )}
          {definitions.map((field, index) => (
            <div key={field.id}>
              {index > 0 && <Separator className="mb-3" />}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{field.label}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge variant="secondary">
                      {FIELD_TYPE_OPTIONS.find((o) => o.value === field.field_type)?.label}
                    </Badge>
                    {field.required && <Badge variant="outline">Required</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <EditFieldDialog field={field} />
                  <form action={deleteFieldDefinition}>
                    <input type="hidden" name="fieldId" value={field.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete field">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <AddFieldDialog organizationId={organizationId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
