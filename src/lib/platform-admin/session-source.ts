// Where a sign-in came from. The sign-in's user agent says it: the web
// dashboard signs in from the server (Node), the mobile app from Dart.
// Pure, so the sessions page and the tests share it.
export type SessionSource = "mobile" | "web" | "other";

export function sessionSource(userAgent: string | null | undefined): SessionSource {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "other";
  if (/^Dart\//i.test(ua) || /dart:io/i.test(ua) || /okhttp|CFNetwork|Darwin\//i.test(ua)) return "mobile";
  if (/^node/i.test(ua) || /Mozilla\//i.test(ua) || /undici/i.test(ua)) return "web";
  return "other";
}

export const SESSION_SOURCE_LABELS: Record<SessionSource, string> = {
  mobile: "Mobile app",
  web: "Web",
  other: "Other",
};

// A mobile sign-in is either a team member (email and password) or a church
// member (phone and a one-time code, so no email).
export type SessionPerson = "team" | "member";

export function sessionPerson(userEmail: string | null | undefined): SessionPerson {
  return userEmail ? "team" : "member";
}
