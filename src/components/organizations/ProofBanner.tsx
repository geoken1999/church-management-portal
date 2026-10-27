import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { VerificationStatus } from "@/lib/organizations/proof";

// Above every dashboard page until the church is verified: the days left of the 2 months, then what is closed and why.
export function ProofBanner({
  status,
  deadlineAt,
  serverNow,
  canManage,
}: {
  status: VerificationStatus;
  deadlineAt: string | null;
  serverNow: string;
  canManage: boolean;
}) {
  const days = deadlineAt ? Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - new Date(serverNow).getTime()) / 86_400_000)) : 0;
  const closed = deadlineAt !== null && days === 0;

  if (status === "verified") return null;

  const dayText = `${days} ${days === 1 ? "day" : "days"}`;
  const message =
    status === "under_review"
      ? "Your registration document is being checked."
      : closed
        ? "Online giving, SMS, WhatsApp, email and Live stream are closed until you send your registration document."
        : status === "rejected"
          ? `Your registration document wasn't accepted. Please send a new one within ${dayText} to keep everything open.`
          : `Send your church's registration document within ${dayText} to keep everything open.`;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <BadgeCheck className="size-4 shrink-0 text-primary" />
        {message}
      </span>
      {canManage && status !== "under_review" && (
        <Link href="/dashboard/profile" className="font-medium text-primary hover:underline">
          Send document
        </Link>
      )}
      {status === "under_review" && (
        <Link href="/dashboard/profile" className="font-medium text-primary hover:underline">
          View status
        </Link>
      )}
    </div>
  );
}

