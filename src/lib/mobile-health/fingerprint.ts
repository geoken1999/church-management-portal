// Groups the same error together however it was reported: the first line of the
// message with numbers, ids and hex addresses blanked out, plus the screen.
export function errorFingerprint(message: string, screen: string): string {
  const firstLine = message.split("\n")[0] ?? "";
  const cleaned = firstLine
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<id>",
    )
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\d+/g, "<n>")
    .trim()
    .slice(0, 160);
  return `${screen.trim().slice(0, 40)}|${cleaned}`;
}

export interface TelemetryInput {
  deviceId: string;
  platform: "android" | "ios";
  appVersion: string;
  buildNumber: string;
  osVersion: string;
  deviceModel: string;
  role: "team" | "member" | "guest" | null;
  kind: "session" | "error" | "crash_suspected";
  screen: string;
  message: string;
  stack: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cut = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

// Turns whatever the app sent into a clean, size-capped report, or null when it
// isn't a usable one. Nothing here trusts the app: lengths are capped and kinds
// and platforms are matched against fixed lists.
export function parseTelemetry(raw: unknown): TelemetryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!UUID.test(deviceId)) return null;
  const platform =
    body.platform === "ios"
      ? "ios"
      : body.platform === "android"
        ? "android"
        : null;
  if (!platform) return null;
  const kind =
    body.kind === "error" ||
    body.kind === "crash_suspected" ||
    body.kind === "session"
      ? body.kind
      : null;
  if (!kind) return null;
  const role =
    body.role === "team" || body.role === "member" || body.role === "guest"
      ? body.role
      : null;
  return {
    deviceId,
    platform,
    appVersion: cut(body.appVersion, 30),
    buildNumber: cut(body.buildNumber, 20),
    osVersion: cut(body.osVersion, 80),
    deviceModel: cut(body.deviceModel, 80),
    role,
    kind,
    screen: cut(body.screen, 60),
    message: cut(body.message, 600),
    stack: cut(body.stack, 12000),
  };
}
