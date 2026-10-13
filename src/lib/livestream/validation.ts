import type { LiveStream, LiveStreamOutput } from "@/types/database";

export const LAYOUTS = [
  { value: "GRID", label: "Grid: everyone side by side" },
  { value: "SPOTLIGHT", label: "Spotlight: one big, the rest small" },
  { value: "SIDEBAR", label: "Sidebar: one big, the rest on the side" },
] as const;
export const QUALITIES = [
  { value: "low", label: "Standard (saves data)" },
  { value: "med", label: "HD" },
  { value: "high", label: "Full HD" },
] as const;
export const THEMES = [
  { value: "DARK", label: "Dark" },
  { value: "LIGHT", label: "Light" },
  { value: "DEFAULT", label: "Default" },
] as const;

export const MAX_OUTPUTS = 4;

// Where "send it to YouTube / Facebook" can point: an RTMP address.
export const isRtmpUrl = (value: string) => /^rtmps?:\/\/[^\s]+$/i.test(value);

export function cleanOutputs(raw: unknown): LiveStreamOutput[] | { error: string } {
  if (!Array.isArray(raw)) return [];
  const result: LiveStreamOutput[] = [];
  for (const item of raw.slice(0, MAX_OUTPUTS)) {
    const o = item as Partial<LiveStreamOutput>;
    const url = String(o.url ?? "").trim();
    const streamKey = String(o.streamKey ?? "").trim();
    if (!url && !streamKey) continue;
    if (!isRtmpUrl(url)) return { error: "A stream address must start with rtmp:// or rtmps://." };
    if (!streamKey) return { error: "Add the stream key for each address." };
    result.push({ name: String(o.name ?? "").trim().slice(0, 40) || "Other", url: url.slice(0, 300), streamKey: streamKey.slice(0, 300) });
  }
  return result;
}

export const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

export type StreamSettings = Pick<LiveStream, "layout" | "layout_priority" | "orientation" | "theme" | "quality" | "audio_only" | "record" | "notify_members" | "chat_enabled">;

export function cleanSettings(raw: Record<string, unknown>): StreamSettings {
  return {
    layout: pick(raw.layout, ["GRID", "SPOTLIGHT", "SIDEBAR"], "GRID"),
    layout_priority: pick(raw.layoutPriority, ["SPEAKER", "PIN"], "SPEAKER"),
    orientation: pick(raw.orientation, ["landscape", "portrait"], "landscape"),
    theme: pick(raw.theme, ["DARK", "LIGHT", "DEFAULT"], "DARK"),
    quality: pick(raw.quality, ["low", "med", "high"], "high"),
    audio_only: raw.audioOnly === true,
    record: raw.record === true,
    notify_members: raw.notifyMembers !== false,
    chat_enabled: raw.chatEnabled !== false,
  };
}

// Viewers who reported in within this long count as watching.
export const VIEWER_WINDOW_SECONDS = 30;
