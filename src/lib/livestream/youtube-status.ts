// Whether a YouTube video is live now, still to come, or has finished, from the YouTube Data API's answer for it. Pure.

export type YoutubeLiveState = "live" | "upcoming" | "ended" | "unknown";

interface VideosResponse {
  items?: {
    snippet?: { liveBroadcastContent?: string };
    liveStreamingDetails?: { actualEndTime?: string; actualStartTime?: string };
  }[];
}

/** "unknown" whenever the answer doesn't settle it (no such video, a video that was never live): the card is then left as it is. */
export function youtubeLiveState(response: unknown): YoutubeLiveState {
  const item = (response as VideosResponse | null)?.items?.[0];
  if (!item) return "unknown";
  if (item.liveStreamingDetails?.actualEndTime) return "ended";
  switch (item.snippet?.liveBroadcastContent) {
    case "live":
      return "live";
    case "upcoming":
      return "upcoming";
    default:
      return "unknown";
  }
}
