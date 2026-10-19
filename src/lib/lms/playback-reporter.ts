// Decides when a playing video should tell the server where it is: about every `intervalMs` of playback,
// and when asked to (pause, end, leaving the lesson), never twice for the same spot.
export class PlaybackReporter {
  private lastAt: number | null = null;
  private lastPosition = -1;
  constructor(private readonly intervalMs = 15000) {}

  shouldReport(nowMs: number, positionSeconds: number, force = false): boolean {
    if (positionSeconds < 0 || positionSeconds === this.lastPosition)
      return false;
    if (!force && this.lastAt !== null && nowMs - this.lastAt < this.intervalMs)
      return false;
    this.lastAt = nowMs;
    this.lastPosition = positionSeconds;
    return true;
  }
}

// Where to start a lesson: where the student left off, unless they had practically finished or barely began.
export function resumePoint(
  positionSeconds: number,
  durationSeconds: number,
): number {
  if (positionSeconds > 3 && positionSeconds < durationSeconds - 5)
    return positionSeconds;
  return 0;
}

const DIRECT_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "m3u8",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
];

// Whether a link points straight at a media file the browser can play (YouTube and Vimeo pages cannot).
export function isDirectMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const path = parsed.pathname.toLowerCase();
    return DIRECT_EXTENSIONS.some((e) => path.endsWith("." + e));
  } catch {
    return false;
  }
}
