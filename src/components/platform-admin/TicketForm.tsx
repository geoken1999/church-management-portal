"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTicketAction,
  updateTicketAction,
  type TicketResult,
} from "@/lib/tickets/actions";
import {
  TICKET_AREAS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "@/lib/tickets/constants";
import type { TicketInput } from "@/lib/tickets/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const EMPTY_TICKET: TicketInput = {
  type: "change_request",
  title: "",
  description: "",
  status: "open",
  priority: "medium",
  area: "general",
  assignee: "",
  release: "",
  references: "",
};

// Raise a new ticket, or edit an existing one. A change request is the usual way to ask for something
// new: say what you want and why; the status, priority and release are filled in as it is worked on.
export function TicketForm({
  ticketId,
  initial,
  submitLabel,
}: {
  ticketId?: string;
  initial: TicketInput;
  submitLabel: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set =
    (key: keyof TicketInput) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setSaved(false);
    };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result: TicketResult = await (
        ticketId ? updateTicketAction(ticketId, form) : createTicketAction(form)
      ).catch(() => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else {
        setSaved(true);
        if (!ticketId) {
          setForm(EMPTY_TICKET);
          if (result.id) router.push(`/platform-admin/tickets/${result.id}`);
        }
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorToast message={error} />
      <div className="space-y-1.5">
        <Label htmlFor="ticket-title">Title</Label>
        <Input
          id="ticket-title"
          value={form.title}
          onChange={set("title")}
          maxLength={160}
          placeholder="Short summary of the bug or the change"
        />
        <FieldError id="ticket-title-error" message={errors.title} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticket-description">Description</Label>
        <Textarea
          id="ticket-description"
          rows={6}
          value={form.description}
          onChange={set("description")}
          maxLength={8000}
          placeholder="What should change, why it matters, how to reproduce it, anything the person fixing it should know"
        />
        <FieldError
          id="ticket-description-error"
          message={errors.description}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-type">Type</Label>
          <select
            id="ticket-type"
            className={SELECT}
            value={form.type}
            onChange={set("type")}
          >
            {TICKET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-priority">Priority</Label>
          <select
            id="ticket-priority"
            className={SELECT}
            value={form.priority}
            onChange={set("priority")}
          >
            {TICKET_PRIORITIES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-status">Status</Label>
          <select
            id="ticket-status"
            className={SELECT}
            value={form.status}
            onChange={set("status")}
          >
            {TICKET_STATUSES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-area">Area</Label>
          <select
            id="ticket-area"
            className={SELECT}
            value={form.area}
            onChange={set("area")}
          >
            {[...new Set([...TICKET_AREAS, form.area])].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <FieldError id="ticket-area-error" message={errors.area} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-assignee">Assigned to</Label>
          <Input
            id="ticket-assignee"
            value={form.assignee}
            onChange={set("assignee")}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-release">Release</Label>
          <Input
            id="ticket-release"
            value={form.release}
            onChange={set("release")}
            maxLength={40}
            placeholder="e.g. web 1.1.0 / app 1.5.0"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticket-references">References</Label>
        <Input
          id="ticket-references"
          value={form.references}
          onChange={set("references")}
          maxLength={1000}
          placeholder="Commit hashes, migration numbers, links"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </form>
  );
}
