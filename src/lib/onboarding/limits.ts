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
  | "groupLimit"
  | "maxAdditionalAdmins"
  | "maxAdditionalStaff"
  | "kmeetMaxDurationMinutes"
  | "instagramAccountLimit"
  | "youtubeAccountLimit"
  | "mobileFeatureLimit"
>;

// The limits a custom plan's tenant gets from what the platform admin set. Every limit that was not
// set falls back to the Starter plan's number (monthly emails, SMS, WhatsApp and AI replies, storage,
// members, branches, forms, chat groups, logins, call length, social accounts), or to no limit where the
// admin chose that, so a tenant never gets more than was priced. Mobile app features default to 15,
// the most the app allows.
export function limitsFor(credits: Credits): LimitFields {
  const starter = PLANS.basic;
  const size = (
    line: Credits[keyof Credits],
    fallback: number | null,
  ): number | null => (line?.unlimited ? null : line ? line.count : fallback);
  return {
    emailsPerMonth: credits.email?.count ?? starter.emailsPerMonth,
    smsPerMonth: credits.sms?.count ?? starter.smsPerMonth,
    whatsappPerMonth: credits.whatsapp?.count ?? starter.whatsappPerMonth,
    aiRepliesPerMonth: credits.ai?.count ?? starter.aiRepliesPerMonth,
    storageBytes: credits.storage
      ? credits.storage.count * 1024 ** 3
      : starter.storageBytes,
    memberLimit: size(credits.members, starter.memberLimit),
    branchLimit: size(credits.branches, starter.branchLimit),
    formsLimit: size(credits.forms, starter.formsLimit),
    groupLimit: size(credits.groups, starter.groupLimit),
    maxAdditionalAdmins: credits.admins?.count ?? starter.maxAdditionalAdmins,
    maxAdditionalStaff: credits.staff?.count ?? starter.maxAdditionalStaff,
    kmeetMaxDurationMinutes: size(
      credits.kmeet,
      starter.kmeetMaxDurationMinutes,
    ),
    instagramAccountLimit:
      credits.instagram?.count ?? starter.instagramAccountLimit,
    youtubeAccountLimit: credits.youtube?.count ?? starter.youtubeAccountLimit,
    // The Starter plan's number for everyone (the most the app allows); not sold in blocks.
    mobileFeatureLimit: 15,
  };
}
