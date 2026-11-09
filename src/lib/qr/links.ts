// The rules of a QR code's short link, shared by the dashboard (to validate what is typed) and the public /q/<code>
// route (to decide where a scan goes).

export type QrPlatform = "ios" | "android" | "desktop";

export const QR_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,39}$/;

// Letters and digits that are hard to mix up when read aloud or typed from a printout.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomQrCode(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function detectPlatform(userAgent: string): QrPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

// Link-preview and search robots that fetch a link when it is shared; they are sent on but not counted as scans.
export function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slurp|embedly|quora link|vkshare|skypeuripreview|telegram/i.test(userAgent);
}

/** A web address a scan can be sent to, or null: only http(s) addresses, and never this site's own short links. */
export function cleanDestination(raw: string, siteHost?: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    if (siteHost && url.host === siteHost && url.pathname.startsWith("/q/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface QrTargets {
  destination_url: string;
  ios_url: string | null;
  android_url: string | null;
  desktop_url: string | null;
}

/** Where a scan from this platform goes: the platform's own address if one is set, otherwise the main one. */
export function destinationFor(targets: QrTargets, platform: QrPlatform): string {
  const own = platform === "ios" ? targets.ios_url : platform === "android" ? targets.android_url : targets.desktop_url;
  return own || targets.destination_url;
}
