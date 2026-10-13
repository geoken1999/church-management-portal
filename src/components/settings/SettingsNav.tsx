import Link from "next/link";

export const SETTINGS_SECTIONS = [
  { key: "church", label: "Church & app", description: "Profile, logo, mobile app, website widget" },
  { key: "payments", label: "Payments & payouts", description: "Payment gateway, payout details, membership fee" },
  { key: "email", label: "Email", description: "Your own mail server, email templates" },
  { key: "whatsapp", label: "WhatsApp", description: "Your number, backup channel, message templates" },
  { key: "automations", label: "Automations & AI", description: "Automation templates, AI rules" },
  { key: "accounts", label: "Connected accounts", description: "Instagram, YouTube, Facebook" },
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

export function isSettingsSection(value: string | undefined): value is SettingsSectionKey {
  return SETTINGS_SECTIONS.some((s) => s.key === value);
}

// The list of settings areas, down the side (across the top on a phone).
export function SettingsNav({ active }: { active: SettingsSectionKey }) {
  return (
    <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section.key}
          href={`/dashboard/settings?section=${section.key}`}
          aria-current={active === section.key ? "page" : undefined}
          className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors lg:shrink ${
            active === section.key ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-accent/50"
          }`}
        >
          <span className="block text-sm font-medium">{section.label}</span>
          <span className="hidden text-xs text-muted-foreground lg:block">{section.description}</span>
        </Link>
      ))}
    </nav>
  );
}
