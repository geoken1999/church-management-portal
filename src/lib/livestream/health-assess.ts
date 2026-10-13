// Turns what we can measure about a live stream into a plain verdict. Pure, so it can be tested.

export interface FeedReading {
  // False when the stream's playlist couldn't be fetched at all.
  reachable: boolean;
  // Seconds since the video service last added video to the playlist, and its segment length.
  ageSeconds: number | null;
  targetSeconds: number | null;
}

export interface ViewerReading {
  count: number;
  bufferingCount: number;
  avgRttMs: number | null;
  avgBufferedMs: number | null;
  stalls: number;
}

export type HealthLevel = "offline" | "good" | "fair" | "poor";

export interface StreamHealth {
  level: HealthLevel;
  // What is wrong (or a short "all good"), in words for the team.
  reasons: string[];
  // A rough estimate of how far behind real time viewers are, in seconds.
  estimatedDelaySeconds: number | null;
  feed: FeedReading;
  viewers: ViewerReading;
  ingestActive: boolean;
}

export function assessHealth(input: { live: boolean; ingestActive: boolean; feed: FeedReading; viewers: ViewerReading }): StreamHealth {
  const { feed, viewers } = input;
  const reasons: string[] = [];
  let level: HealthLevel = "good";
  const worsen = (to: HealthLevel) => {
    const order: HealthLevel[] = ["good", "fair", "poor"];
    if (order.indexOf(to) > order.indexOf(level)) level = to;
  };

  if (!input.live) return { level: "offline", reasons: ["Not live right now."], estimatedDelaySeconds: null, feed, viewers, ingestActive: input.ingestActive };

  const target = feed.targetSeconds ?? 2;
  if (!feed.reachable) {
    worsen("poor");
    reasons.push("The video feed can't be reached. Viewers may see nothing.");
  } else if (feed.ageSeconds !== null && feed.ageSeconds > Math.max(3 * target, 10)) {
    worsen("poor");
    reasons.push(`No new video for ${Math.round(feed.ageSeconds)} seconds. Check the camera, OBS and the internet connection at the venue.`);
  }

  if (viewers.count > 0) {
    const share = viewers.bufferingCount / viewers.count;
    if (share >= 0.3) {
      worsen("poor");
      reasons.push(`${Math.round(share * 100)}% of viewers are buffering. Try a lower quality, or check the broadcaster's upload speed.`);
    } else if (share >= 0.1) {
      worsen("fair");
      reasons.push(`${Math.round(share * 100)}% of viewers are buffering. This is often their own connection.`);
    }
    if (viewers.avgRttMs !== null && viewers.avgRttMs > 2000) {
      worsen("fair");
      reasons.push(`Viewers' connections are slow to respond (about ${Math.round(viewers.avgRttMs)} ms).`);
    }
  }

  // Viewers hold a few segments of video before playing; add how stale the newest one is and encoding time.
  const held = viewers.avgBufferedMs !== null ? viewers.avgBufferedMs / 1000 : 3 * target;
  const estimatedDelaySeconds = feed.reachable ? Math.round((held + target * 0.5 + 3) * 10) / 10 : null;
  if (estimatedDelaySeconds !== null && estimatedDelaySeconds > 25) {
    worsen("fair");
    reasons.push(`Viewers are about ${Math.round(estimatedDelaySeconds)} seconds behind real time.`);
  }

  if (reasons.length === 0) reasons.push("Everything looks healthy.");
  return { level, reasons, estimatedDelaySeconds, feed, viewers, ingestActive: input.ingestActive };
}
