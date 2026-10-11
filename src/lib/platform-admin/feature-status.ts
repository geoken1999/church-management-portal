// Module status rules. Pure (no "server-only"), so the menu, the access
// checks and the tests all share them.
export const FEATURE_STATUSES = ["off", "testing", "beta", "live"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  off: "Off",
  testing: "Testing",
  beta: "Beta",
  live: "Live",
};

export const FEATURE_STATUS_HELP: Record<FeatureStatus, string> = {
  off: "Nobody can use it.",
  testing: "Only the test users can see and use it.",
  beta: "Everyone can use it, with a Beta tag.",
  live: "Everyone can use it. A New tag shows for 15 days after leaving Beta.",
};

export const NEW_TAG_DAYS = 15;

// The modules that were already live before new modules started in testing.
// A module with no saved status is live only if it is listed here; any other
// (a module added since) starts in testing, so it reaches the test users only
// until a platform admin moves it to Beta or Live. Adding a new module needs
// no change here: leaving it out of this list is what makes it start in
// testing. Once a platform admin sets a status, that is saved and this list
// no longer matters for it.
export const LAUNCHED_MODULES: readonly string[] = [
  "branches", "members", "attendance", "leaders", "youth", "committee", "families",
  "ministries", "worship", "media", "events", "todos", "planner", "kmeet", "kaudio",
  "forms", "folder", "reports", "widget", "accounting", "fundraisers", "offerings",
  "donations", "email", "sms", "whatsapp", "instagram", "youtube", "facebook",
  "aitools", "airules", "automations",
];

export const DEFAULT_NEW_MODULE_STATUS: FeatureStatus = "testing";

// The status of a module nobody has set yet.
export function defaultStatusFor(tab: string): FeatureStatus {
  return LAUNCHED_MODULES.includes(tab) ? "live" : DEFAULT_NEW_MODULE_STATUS;
}
const DEFAULT_TESTER_EMAILS = ["geoken199915@gmail.com"];

export function isFeatureStatus(value: unknown): value is FeatureStatus {
  return typeof value === "string" && (FEATURE_STATUSES as readonly string[]).includes(value);
}

// Who counts as a test user: FEATURE_TESTER_EMAILS (comma separated) when
// set, otherwise the platform's own test account.
export function featureTesterEmails(env: string | undefined = process.env.FEATURE_TESTER_EMAILS): string[] {
  const configured = (env ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_TESTER_EMAILS;
}

export function isTester(userEmail: string | null | undefined, testers: string[] = featureTesterEmails()): boolean {
  return Boolean(userEmail) && testers.includes((userEmail as string).toLowerCase());
}

// Whether this user is blocked from the module right now.
export function isFeatureUnavailable(status: FeatureStatus, userEmail: string | null | undefined, testers?: string[]): boolean {
  if (status === "off") return true;
  if (status === "testing") return !isTester(userEmail, testers);
  return false;
}

export type FeatureTag = "testing" | "beta" | "new";

// The small label beside a module in the menu, if any.
export function featureTag(status: FeatureStatus, newUntil: string | null, now: Date): FeatureTag | null {
  if (status === "testing") return "testing";
  if (status === "beta") return "beta";
  if (status === "live" && newUntil && new Date(newUntil).getTime() > now.getTime()) return "new";
  return null;
}

// What new_until becomes when a module changes status: moving from beta to
// live starts the New period, moving between anything else clears it, and
// re-saving live leaves it alone.
export function nextNewUntil(from: FeatureStatus, to: FeatureStatus, current: string | null, now: Date): string | null {
  if (to !== "live") return null;
  if (from === "beta") return new Date(now.getTime() + NEW_TAG_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return from === "live" ? current : null;
}
