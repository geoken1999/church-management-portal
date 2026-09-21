// No "server-only" guard — plain constants, safe to import from Client
// Components too (e.g. to render a progress bar's max value).

export type PlanId = "basic";

export interface PlanLimits {
  id: PlanId;
  name: string;
  emailsPerMonth: number;
  smsPerMonth: number;
  storageBytes: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  basic: {
    id: "basic",
    name: "Basic",
    emailsPerMonth: 1000,
    // Far smaller than the email quota — SMS costs real money per message
    // sent through the shared Twilio account, unlike email's Resend free
    // tier headroom.
    smsPerMonth: 100,
    storageBytes: 2 * 1024 * 1024 * 1024, // 2GB
  },
};

// Every org is on Basic for now — organizations.plan exists for when real
// plan selection/billing lands, but nothing reads it yet since there's
// only one plan to be on. Takes organizationId already so call sites don't
// need to change once that lookup is real.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getPlanLimits(organizationId: string): PlanLimits {
  return PLANS.basic;
}
