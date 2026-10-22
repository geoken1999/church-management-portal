import { describe, expect, it } from "vitest";
import { limitsFor } from "@/lib/onboarding/limits";
import { cleanCredits } from "@/lib/onboarding/config";
import { PLANS } from "@/lib/plans/config";

describe("limitsFor", () => {
  it("gives exactly what was set", () => {
    const limits = limitsFor(
      cleanCredits({
        email: { count: 20000, price: 200 },
        sms: { count: 500, price: 300 },
        storage: { count: 50, price: 100 },
        members: { count: 3050, price: 500 },
        branches: { count: 8, price: 0 },
        forms: { unlimited: true, price: 0 },
        groups: { count: 12, price: 0 },
        admins: { count: 4, price: 0 },
        staff: { count: 12, price: 0 },
        kmeet: { unlimited: true, price: 50 },
        instagram: { count: 2, price: 0 },
        youtube: { count: 3, price: 0 },
        mobileFeatures: { count: 10, price: 0 },
      }),
    );
    expect(limits).toMatchObject({
      emailsPerMonth: 20000,
      smsPerMonth: 500,
      whatsappPerMonth: PLANS.basic.whatsappPerMonth,
      aiRepliesPerMonth: PLANS.basic.aiRepliesPerMonth,
      storageBytes: 50 * 1024 ** 3,
      memberLimit: 3050,
      branchLimit: 8,
      formsLimit: null,
      groupLimit: 12,
      maxAdditionalAdmins: 4,
      maxAdditionalStaff: 12,
      kmeetMaxDurationMinutes: null,
      instagramAccountLimit: 2,
      youtubeAccountLimit: 3,
      mobileFeatureLimit: 10,
    });
  });

  it("falls back to Starter for size limits that were not set, and none for messaging", () => {
    const limits = limitsFor({});
    expect(limits.memberLimit).toBe(PLANS.basic.memberLimit);
    expect(limits.kmeetMaxDurationMinutes).toBe(
      PLANS.basic.kmeetMaxDurationMinutes,
    );
    expect(limits.storageBytes).toBe(PLANS.basic.storageBytes);
    expect(limits.emailsPerMonth).toBe(PLANS.basic.emailsPerMonth);
    expect(limits.smsPerMonth).toBe(PLANS.basic.smsPerMonth);
    expect(limits.whatsappPerMonth).toBe(PLANS.basic.whatsappPerMonth);
    expect(limits.aiRepliesPerMonth).toBe(PLANS.basic.aiRepliesPerMonth);
    expect(limits.groupLimit).toBe(3);
    expect(limits.mobileFeatureLimit).toBe(15);
  });

  it("only allows no-limit where it makes sense, and keeps counts within range", () => {
    const cleaned = cleanCredits({
      sms: { unlimited: true, price: 1 },
      mobileFeatures: { count: 40, price: 0 },
      members: { count: 5, price: -3 },
    });
    expect(cleaned).toEqual({});
  });
});
