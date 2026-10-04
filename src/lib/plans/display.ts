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
    { label: `${plan.whatsappPerMonth.toLocaleString()} WhatsApp/month`, included: true },
    { label: `${plan.aiRepliesPerMonth.toLocaleString()} AI credits/month`, included: true },
    { label: `${formatStorage(plan.storageBytes)} storage`, included: true },
    { label: `Up to ${plan.maxAdditionalAdmins} added admin${plan.maxAdditionalAdmins === 1 ? "" : "s"} + ${plan.maxAdditionalStaff} added staff`, included: true },
    { label: plan.branchLimit === null ? "Unlimited branches" : `Up to ${plan.branchLimit} branches`, included: true },
    { label: plan.memberLimit === null ? "Unlimited members" : `Up to ${plan.memberLimit.toLocaleString()} members`, included: true },
    { label: plan.formsLimit === null ? "Unlimited forms" : `Up to ${plan.formsLimit} forms`, included: true },
    {
      label: plan.kmeetMaxDurationMinutes === null ? "Unlimited K-meet/K-audio" : `${plan.kmeetMaxDurationMinutes}-min K-meet, ${plan.kmeetMaxDurationMinutes + 10}-min K-audio`,
      included: true,
    },
    {
      label: plan.financeEnabled
        ? plan.ownPaymentGatewayEnabled
          ? "Finance (Fund Raiser, Offering, Donation) — own or shared gateway"
          : "Finance (Fund Raiser, Offering, Donation) — shared gateway only"
        : "Finance (Fund Raiser, Offering, Donation)",
      included: plan.financeEnabled,
    },
    { label: "Bring your own SMTP", included: plan.customSmtpEnabled },
    {
      label: `Social Media (Instagram, YouTube, Facebook) — up to ${plan.instagramAccountLimit} account${plan.instagramAccountLimit === 1 ? "" : "s"} each`,
      included: plan.socialMediaEnabled,
    },
    {
      label: plan.automationLimit === null ? "Automation — unlimited" : `Automation — up to ${plan.automationLimit} at a time`,
      included: plan.automationLimit !== 0,
    },
    { label: `${plan.supportSlaDays}-working-day support SLA`, included: true },
  ];
}

export function planDescription(planId: PlanId): string {
  if (planId === "basic") return "For small churches getting started.";
  if (planId === "premium") return "For growing churches running campaigns and giving.";
  return "For large, multi-branch churches active on social media.";
}
