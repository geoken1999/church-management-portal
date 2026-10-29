import crypto from "node:crypto";

// The signed token Zoom's Meeting SDK needs to let a browser join or start a meeting. Pure (the clock is passed in).

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function zoomSignature(opts: { sdkKey: string; sdkSecret: string; meetingNumber: string; role: 0 | 1; now?: number }): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000) - 30; // a little slack for clock drift
  const exp = iat + 60 * 60 * 2;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ appKey: opts.sdkKey, sdkKey: opts.sdkKey, mn: opts.meetingNumber, role: opts.role, iat, exp, tokenExp: exp }));
  const signature = crypto.createHmac("sha256", opts.sdkSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** Zoom meeting numbers are 9-11 digits; people paste them with spaces. */
export function cleanMeetingNumber(value: string): string | null {
  const digits = value.replace(/\s+/g, "");
  return /^\d{9,11}$/.test(digits) ? digits : null;
}
