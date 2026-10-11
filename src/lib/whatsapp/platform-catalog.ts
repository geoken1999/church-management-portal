import type { WhatsAppTemplateCategory } from "@/types/database";

// The templates KingdomFlow offers every church. Variables are numbered
// {{1}}, {{2}}... as WhatsApp requires; in the campaign composer a church
// maps each to a member field (first name, ...) or typed text.
//
// Written to read as warm, general messages: WhatsApp rejects a template
// whose wording doesn't match its category (INCORRECT_CATEGORY), and
// anything that looks like a one-time code ("your code is X") or a
// transaction receipt is judged accordingly, so none of these do.
export interface PlatformTemplateDefinition {
  key: string;
  name: string;
  label: string;
  description: string;
  category: WhatsAppTemplateCategory;
  language: string;
  body: string;
  examples: string[];
}

export const PLATFORM_TEMPLATE_CATALOG: PlatformTemplateDefinition[] = [
  {
    key: "service_reminder",
    name: "kf_service_reminder",
    label: "Service reminder",
    description: "Remind members of an upcoming service.",
    category: "marketing",
    language: "en_US",
    body: "Hi {{1}}, a reminder that our service at {{2}} is on {{3}}. We look forward to worshipping with you!",
    examples: ["Ann", "Grace Church", "Sunday, 10:00 AM"],
  },
  {
    key: "event_invite",
    name: "kf_event_invite",
    label: "Event invitation",
    description: "Invite members to an event.",
    category: "marketing",
    language: "en_US",
    body: "Hi {{1}}, you're invited to {{2}} on {{3}}. We'd love to see you there!",
    examples: ["Ann", "Youth Camp", "Saturday, 21 Nov"],
  },
  {
    key: "birthday_wish",
    name: "kf_birthday_wish",
    label: "Birthday wish",
    description: "A birthday greeting from the church.",
    category: "marketing",
    language: "en_US",
    body: "Happy birthday {{1}}! 🎉 Everyone at {{2}} is praying for your joy and well-being today.",
    examples: ["Ann", "Grace Church"],
  },
  {
    key: "anniversary_wish",
    name: "kf_anniversary_wish",
    label: "Anniversary wish",
    description: "A wedding anniversary greeting.",
    category: "marketing",
    language: "en_US",
    body: "Happy anniversary {{1}}! 💐 Everyone at {{2}} is praying for God's blessings on your family.",
    examples: ["Ann and John", "Grace Church"],
  },
  {
    key: "welcome_visitor",
    name: "kf_welcome_visitor",
    label: "Welcome a visitor",
    description: "Thank a first-time visitor.",
    category: "marketing",
    language: "en_US",
    body: "Hi {{1}}, thank you for visiting {{2}}. We were so glad to have you with us and hope to see you again soon!",
    examples: ["Ann", "Grace Church"],
  },
  {
    key: "thank_you_giving",
    name: "kf_thank_you_giving",
    label: "Thank you for giving",
    description: "Thank a member for their giving.",
    category: "marketing",
    language: "en_US",
    body: "Hi {{1}}, thank you for your generous giving to {{2}}. Your support makes a real difference. God bless you!",
    examples: ["Ann", "Grace Church"],
  },
  {
    key: "prayer_followup",
    name: "kf_prayer_followup",
    label: "Prayer follow-up",
    description: "Let a member know they are being prayed for.",
    category: "marketing",
    language: "en_US",
    body: "Hi {{1}}, we are keeping you in our prayers. If there is anything we can pray for with you, simply reply to this message. With love from all of us at {{2}}, and God bless you.",
    examples: ["Ann", "Grace Church"],
  },
];

export function variableCountOf(body: string): number {
  const found = new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
  return found.size;
}
