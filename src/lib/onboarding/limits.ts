import { PLANS, type CustomPlanOverrides } from "@/lib/plans/config";
import type { Credits } from "@/lib/onboarding/config";

type LimitFields = Pick<
  CustomPlanOverrides,
  | "emailsPerMonth"
  | "smsPerMonth"
  | "whatsappPerMonth"
  | "aiRepliesPerMonth"
  | "storageBytes"
  | "memberLimit"
  | "branchLimit"
  | "formsLimit"
  | "maxAdditionalAdmins"
  | "maxAdditionalStaff"
  | "kmeetMaxDurationMinutes"
  | "instagramAccountLimit"
  | "youtubeAccountLimit"
  | "mobileFeatureLimit"
>;

// The limits a custom plan's tenant gets from what the platform admin set. Monthly emails, SMS,
// WhatsApp and AI replies are none unless given. The size limits fall back to the Starter plan's
// numbers unless set (or set to no limit), so a tenant never gets more than was priced. Mobile app
// features default to 15, the most the app allows.
export function limitsFor(credits: Credits): LimitFields {
  const starter = PLANS.basic;
  const size = (
    line: Credits[keyof Credits],
    fallback: number | null,
  ): number | null => (line?.unlimited ? null : line ? line.count : fallback);
  return {
    emailsPerMonth: credits.email?.count ?? 0,
    smsPerMonth: credits.sms?.count ?? 0,
    whatsappPerMonth: credits.whatsapp?.count ?? 0,
    aiRepliesPerMonth: credits.ai?.count ?? 0,
    storageBytes: credits.storage
      ? credits.storage.count * 1024 ** 3
      : starter.storageBytes,
    memberLimit: size(credits.members, starter.memberLimit),
    branchLimit: size(credits.branches, starter.branchLimit),
    formsLimit: size(credits.forms, starter.formsLimit),
    maxAdditionalAdmins: credits.admins?.count ?? starter.maxAdditionalAdmins,
    maxAdditionalStaff: credits.staff?.count ?? starter.maxAdditionalStaff,
    kmeetMaxDurationMinutes: size(
      credits.kmeet,
      starter.kmeetMaxDurationMinutes,
    ),
    instagramAccountLimit:
      credits.instagram?.count ?? starter.instagramAccountLimit,
    youtubeAccountLimit: credits.youtube?.count ?? starter.youtubeAccountLimit,
    mobileFeatureLimit: credits.mobileFeatures?.count ?? 15,
  };
}
