// Rules for pausing marketing sends to a person WhatsApp won't deliver to.
// Pure (no database), so the sender, the webhook and the tests agree.

// 131049: "This message was not delivered to maintain healthy ecosystem
//          engagement": WhatsApp's per-person marketing limit.
// 131026: the number can't receive WhatsApp messages (not on WhatsApp, or
//          hasn't accepted the terms), so retrying is pointless for a while.
export const MARKETING_LIMIT_CODE = "131049";
export const UNREACHABLE_CODE = "131026";

// How many days to hold marketing messages back after this failure, given
// how many times in a row it has happened. null = this error doesn't pause
// anything (e.g. 131047, the 24-hour window, which a template gets around).
export function blockDaysFor(errorCode: string | null | undefined, consecutiveFailures: number): number | null {
  if (errorCode === MARKETING_LIMIT_CODE) return consecutiveFailures <= 1 ? 3 : consecutiveFailures === 2 ? 7 : 14;
  if (errorCode === UNREACHABLE_CODE) return 30;
  return null;
}

export function isBlocked(blockedUntil: string | null | undefined, now: Date): boolean {
  return Boolean(blockedUntil) && new Date(blockedUntil as string).getTime() > now.getTime();
}

// Messages are either marketing (promotional: invitations, greetings), which
// are capped per person, or not (utility and the like), which are not.
export function isMarketingCategory(category: string | null | undefined): boolean {
  return (category ?? "").toLowerCase() === "marketing";
}

// What to tell a church when a person was skipped or a message didn't land.
export function friendlyDeliveryReason(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case MARKETING_LIMIT_CODE:
      return "WhatsApp is limiting marketing messages to this person right now.";
    case UNREACHABLE_CODE:
      return "This number can't receive WhatsApp messages.";
    case "131047":
      return "This person hasn't messaged in the last 24 hours, so a template was needed.";
    default:
      return "WhatsApp couldn't deliver this message.";
  }
}
