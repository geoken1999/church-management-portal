"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, LifeBuoy, UserRound, CalendarDays } from "lucide-react";
import { createSupportTicket, deleteSupportTicket, type SupportTicketFormState } from "@/lib/support/actions";
import {
  TICKET_CATEGORIES,
  TICKET_URGENCIES,
  TICKET_CATEGORY_LABELS,
  TICKET_URGENCY_LABELS,
} from "@/lib/support/validation";
import type { SupportTicket, SupportTicketCategory, SupportTicketUrgency } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
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

type TicketRow = SupportTicket & { profiles: { first_name: string; last_name: string } | null };

const initialState: SupportTicketFormState = {};

const URGENCY_VARIANTS: Record<SupportTicketUrgency, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function raiserName(ticket: TicketRow): string {
  return ticket.profiles ? `${ticket.profiles.first_name} ${ticket.profiles.last_name}`.trim() : "Someone";
}

function RaiseTicketDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<SupportTicketFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>("technical");
  const [urgency, setUrgency] = useState<SupportTicketUrgency>("medium");

  function reset() {
    setState(initialState);
    setCategory("technical");
    setUrgency("medium");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createSupportTicket(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Raise a ticket
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a support ticket</DialogTitle>
          <DialogDescription>
            Describe what you need help with — you&apos;ll be contacted separately about this.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="urgency" value={urgency} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" placeholder="Short summary of the issue" required aria-invalid={Boolean(state.fieldErrors?.subject)} />
            <FieldError id="subject-error" message={state.fieldErrors?.subject} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory((v ?? "technical") as SupportTicketCategory)}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue>{(v: string | null) => TICKET_CATEGORY_LABELS[(v ?? "technical") as SupportTicketCategory]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TICKET_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="category-error" message={state.fieldErrors?.category} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency((v ?? "medium") as SupportTicketUrgency)}>
                <SelectTrigger id="urgency" className="w-full">
                  <SelectValue>{(v: string | null) => TICKET_URGENCY_LABELS[(v ?? "medium") as SupportTicketUrgency]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TICKET_URGENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TICKET_URGENCY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="What's happening, and what did you expect instead?"
              aria-invalid={Boolean(state.fieldErrors?.description)}
            />
            <FieldError id="description-error" message={state.fieldErrors?.description} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting..." : "Submit ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketCard({ ticket, canDelete }: { ticket: TicketRow; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-base font-bold">{ticket.subject}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{TICKET_CATEGORY_LABELS[ticket.category]}</Badge>
              <Badge variant={URGENCY_VARIANTS[ticket.urgency]}>{TICKET_URGENCY_LABELS[ticket.urgency]}</Badge>
              <Badge variant="secondary" className="capitalize">
                {ticket.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          {canDelete && (
            <form action={deleteSupportTicket}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Withdraw
              </Button>
            </form>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{ticket.description}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <UserRound className="size-3.5" />
            {raiserName(ticket)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDate(ticket.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function SupportManager({
  organizationId,
  tickets,
  currentUserId,
  canManage,
}: {
  organizationId: string;
  tickets: TicketRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RaiseTicketDialog organizationId={organizationId} />
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <LifeBuoy className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No tickets yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Click &quot;Raise a ticket&quot; if you run into a problem or have a question.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} canDelete={canManage || ticket.created_by === currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}
