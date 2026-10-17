// Reads a video or audio file's length (and picture size) in the browser, so teachers do not type it.

export interface MediaInfo {
  seconds: number;
  width: number | null;
  height: number | null;
}

// Whole minutes for the lesson's length field: rounded up, at least 1 for anything with sound or picture.
export function minutesFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Resolves with the file's length, or null if the browser cannot read it (the teacher can then type it).
export function readMediaInfo(
  file: File,
  kind: "video" | "audio",
): Promise<MediaInfo | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (info: MediaInfo | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      resolve(info);
    };
    const timer = setTimeout(() => finish(null), 15000);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const seconds = element.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) return finish(null);
      const video = element as HTMLVideoElement;
      finish({
        seconds,
        width: kind === "video" ? video.videoWidth || null : null,
        height: kind === "video" ? video.videoHeight || null : null,
      });
    };
    element.onerror = () => finish(null);
    element.src = url;
  });
}
