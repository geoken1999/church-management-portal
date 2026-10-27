"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import type { VerificationStatus } from "@/lib/organizations/proof";

// Above every dashboard page until the church is verified: the 2-minute countdown, then what is closed and why.
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
  const router = useRouter();
  // The server's clock decides when the 2 minutes end, so a wrong clock on this computer changes nothing.
  const [skew] = useState(() => Date.now() - new Date(serverNow).getTime());
  const [left, setLeft] = useState(() => secondsLeft(deadlineAt, skew));

  useEffect(() => {
    if (status !== "not_submitted" || !deadlineAt) return;
    const timer = setInterval(() => {
      const next = secondsLeft(deadlineAt, skew);
      setLeft(next);
      if (next === 0) {
        clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status, deadlineAt, skew, router]);

  if (status === "verified") return null;

  const message =
    status === "under_review"
      ? "Your registration document is being checked."
      : status === "rejected"
        ? "Your registration document wasn't accepted. Online giving, SMS, WhatsApp, email and Live stream are closed until you send a new one."
        : left > 0
          ? `Send your church's registration document within ${left}s to keep everything open.`
          : "Online giving, SMS, WhatsApp, email and Live stream are closed until you send your registration document.";

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

function secondsLeft(deadlineAt: string | null, skew: number): number {
  if (!deadlineAt) return 0;
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() + skew - Date.now()) / 1000));
}
