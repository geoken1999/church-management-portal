"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSupportTicketStatus } from "@/lib/platform-admin/actions";
import { Button } from "@/components/ui/button";
import type { SupportTicketStatus } from "@/types/database";

const NEXT_STATUS: Record<SupportTicketStatus, { label: string; next: SupportTicketStatus }[]> = {
  open: [{ label: "Start work", next: "in_progress" }],
  in_progress: [
    { label: "Mark resolved", next: "resolved" },
    { label: "Back to open", next: "open" },
  ],
  resolved: [{ label: "Close", next: "closed" }],
  closed: [{ label: "Reopen", next: "open" }],
};

export function SupportTicketActions({ ticketId, status }: { ticketId: string; status: SupportTicketStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: SupportTicketStatus) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("ticketId", ticketId);
      formData.set("status", next);
      await updateSupportTicketStatus(formData);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {NEXT_STATUS[status].map((option) => (
        <Button key={option.next} type="button" variant="outline" size="sm" disabled={pending} onClick={() => setStatus(option.next)}>
          {option.label}
        </Button>
      ))}
    </div>
  );
}
