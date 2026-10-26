// The link of a stream a church runs on YouTube or Facebook. Only those two are accepted: the link goes to every member in a
// notification, so an arbitrary address would let anyone with access send members anywhere. Pure.

export type ExternalPlatform = "youtube" | "facebook";

export interface ExternalLink {
  platform: ExternalPlatform;
  /** Normalised: https, no spaces. */
  url: string;
  /** When the link names one YouTube video, so the app can play it inside itself. */
  youtubeVideoId: string | null;
}

export const PLATFORM_NAMES: Record<ExternalPlatform, string> = { youtube: "YouTube", facebook: "Facebook" };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseExternalLink(input: string): ExternalLink | { error: string } {
  let text = input.trim();
  if (!text) return { error: "Paste the link of your YouTube or Facebook live stream." };
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That doesn't look like a link." };
  }
  if (url.protocol !== "https:") return { error: "The link must start with https://" };
  if (url.username || url.password || url.port) return { error: "That link isn't one we can use." };

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "youtu.be") {
    const id = path.slice(1);
    return { platform: "youtube", url: url.toString(), youtubeVideoId: YOUTUBE_ID.test(id) ? id : null };
  }
  if (host === "youtube.com") {
    const fromQuery = url.searchParams.get("v");
    const fromPath = path.match(/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})$/)?.[1];
    const id = fromQuery && YOUTUBE_ID.test(fromQuery) ? fromQuery : (fromPath ?? null);
    return { platform: "youtube", url: url.toString(), youtubeVideoId: id };
  }
  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") {
    return { platform: "facebook", url: url.toString(), youtubeVideoId: null };
  }
  return { error: "Use a link from YouTube or Facebook." };
}

/** How long a live link keeps showing if nobody ends it. */
export const EXTERNAL_LIVE_MAX_HOURS = 12;

/** Whether a saved live link should still show to members: not ended, and not left running for longer than a service could. */
export function externalLiveActive(row: { started_at: string; ended_at: string | null }, now: Date = new Date()): boolean {
  if (row.ended_at) return false;
  return now.getTime() - new Date(row.started_at).getTime() < EXTERNAL_LIVE_MAX_HOURS * 3_600_000;
}
