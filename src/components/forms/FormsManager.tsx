"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, FileText, Users } from "lucide-react";
import { createForm, deleteForm, type FormMetaState } from "@/lib/forms/actions";
import type { CustomForm, FormStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type FormRow = CustomForm & { responseCount: number };

const initialState: FormMetaState = {};

const STATUS_VARIANTS: Record<FormStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  published: "default",
  closed: "secondary",
};

const STATUS_LABELS: Record<FormStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CreateFormDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<FormMetaState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createForm(state, formData);
      setState(result);
      if (result.success && result.formId) {
        setOpen(false);
        router.push(`/dashboard/forms/${result.formId}`);
      }
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
          <Button type="button">
            <Plus className="size-4" />
            Create form
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a form</DialogTitle>
          <DialogDescription>Give it a title — you&apos;ll add fields next.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="New Member Registration" required aria-invalid={Boolean(state.fieldErrors?.title)} />
            <FieldError id="title-error" message={state.fieldErrors?.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Shown to whoever fills this out" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create and continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormCard({ form, canDelete }: { form: FormRow; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <Link href={`/dashboard/forms/${form.id}`} className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-bold">{form.title}</h3>
            <Badge variant={STATUS_VARIANTS[form.status]}>{STATUS_LABELS[form.status]}</Badge>
          </div>
          {form.description && <p className="line-clamp-1 text-sm text-muted-foreground">{form.description}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3.5" />
              {form.fields.length} {form.fields.length === 1 ? "field" : "fields"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {form.responseCount} {form.responseCount === 1 ? "response" : "responses"}
            </span>
            <span>Created {formatDate(form.created_at)}</span>
          </div>
        </Link>
        {canDelete && (
          <form action={deleteForm}>
            <input type="hidden" name="formId" value={form.id} />
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function FormsManager({
  organizationId,
  forms,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  forms: FormRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <CreateFormDialog organizationId={organizationId} />
        </div>
      )}

      {forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No forms yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite
                  ? 'Click "Create form" to build a registration form or survey you can share with a link.'
                  : "Check back once a form has been created."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {forms.map((form) => (
            <FormCard key={form.id} form={form} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
