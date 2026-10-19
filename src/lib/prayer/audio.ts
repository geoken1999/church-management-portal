// Rules for the voice message on a prayer request. Pure, so they can be tested.

export const MAX_PRAYER_AUDIO_SECONDS = 90;
export const MAX_PRAYER_AUDIO_BYTES = 3 * 1024 * 1024;
export const PRAYER_AUDIO_BUCKET = "prayer-audio";

const TYPES: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

// The length the app reports, as a whole number of seconds in range, or null.
export function parseAudioSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = Math.round(value);
  return seconds >= 1 && seconds <= MAX_PRAYER_AUDIO_SECONDS + 5
    ? Math.min(seconds, MAX_PRAYER_AUDIO_SECONDS)
    : null;
}

// What to check before a recording is accepted for upload; null when it is fine.
export function prayerAudioProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!TYPES[file.type]) return "That recording format is not supported.";
  if (!(file.size > 0)) return "The recording is empty.";
  if (file.size > MAX_PRAYER_AUDIO_BYTES)
    return "That recording is too large. Keep it under 90 seconds.";
  return null;
}

// Where a member's recording goes: a folder per church and member, so a path says who owns it.
export function prayerAudioPath(
  organizationId: string,
  memberId: string,
  fileType: string,
  id: string,
): string {
  return `${organizationId}/${memberId}/${id}.${TYPES[fileType] ?? "m4a"}`;
}

// Whether a path the app sends back really lies in this member's own folder.
export function isOwnPrayerAudioPath(
  path: string,
  organizationId: string,
  memberId: string,
): boolean {
  const prefix = `${organizationId}/${memberId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/i.test(rest);
}
