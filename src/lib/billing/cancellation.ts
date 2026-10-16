// Pure rules for cancelling a subscription in the middle of a billing period.

export type CancelMode = "at_period_end" | "immediate";

// A live subscription is cancelled at the end of the period it has paid for (its next charge date),
// so the church keeps what it paid for and is simply not charged again. One that never became live
// (checkout abandoned, halted for a failed payment) has nothing paid for and is cancelled at once.
export function cancelMode(
  status: string,
  nextChargeAt: string | null,
  now: Date,
): CancelMode {
  if (
    status === "active" &&
    nextChargeAt &&
    new Date(nextChargeAt).getTime() > now.getTime()
  )
    return "at_period_end";
  return "immediate";
}

// Whether a subscription that is waiting to cancel has reached the end of its period.
export function cancellationDue(
  cancelAtPeriodEnd: boolean,
  nextChargeAt: string | null,
  now: Date,
): boolean {
  return (
    cancelAtPeriodEnd &&
    (!nextChargeAt || new Date(nextChargeAt).getTime() <= now.getTime())
  );
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
