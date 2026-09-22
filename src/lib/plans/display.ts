// No "server-only" guard — pure display formatting shared between the
// public landing page and the in-dashboard billing page.

import type { PlanId, PlanLimits } from "@/lib/plans/config";

export const PLAN_ORDER: PlanId[] = ["basic", "premium", "pro"];

export function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function planFeatureRows(plan: PlanLimits): { label: string; included: boolean }[] {
  return [
    { label: "Core church management (Members, Branches, Ministries, Events...)", included: true },
    { label: `${plan.emailsPerMonth.toLocaleString()} shared emails/month`, included: true },
    { label: `${plan.smsPerMonth.toLocaleString()} SMS/month`, included: true },
    { label: `${formatStorage(plan.storageBytes)} storage`, included: true },
    { label: `Up to ${plan.maxAdditionalTeamMembers} added team logins`, included: true },
    { label: "Finance (Fund Raiser, Offering, Donation)", included: plan.financeEnabled },
    { label: "Bring your own SMTP", included: plan.customSmtpEnabled },
    { label: "Social Media (Instagram, YouTube, Facebook)", included: plan.socialMediaEnabled },
  ];
}

export function planDescription(planId: PlanId): string {
  if (planId === "basic") return "For small churches getting started.";
  if (planId === "premium") return "For growing churches running campaigns and giving.";
  return "For large, multi-branch churches active on social media.";
}
