// The standard button labels. An iPhone can only show a notification button
// whose text the app registered at start-up, so these are the labels it knows;
// the app (lib/services/push_notification_service.dart, buttonPresets) registers
// the same list. Android shows whatever label was typed.

export const BUTTON_PRESETS = ["Join", "Open", "Watch", "Register", "Give", "View", "Read more"] as const;

// The iPhone category for a label: its own if it's a standard one, else "Open".
export function iosCategoryFor(label: string): string {
  const match = BUTTON_PRESETS.find((preset) => preset.toLowerCase() === label.trim().toLowerCase()) ?? "Open";
  return `btn_${match.toLowerCase().replace(/ /g, "_")}`;
}
