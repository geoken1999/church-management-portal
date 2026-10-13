// What a connection needs to broadcast at each quality, and how to read a speed test. Pure.

// Upload speed (Mbps) the broadcast needs at each quality, with room to spare for the rest of the network.
export const QUALITY_NEEDS: Record<"low" | "med" | "high", { label: string; needMbps: number }> = {
  low: { label: "Standard", needMbps: 1.5 },
  med: { label: "HD", needMbps: 3 },
  high: { label: "Full HD", needMbps: 5 },
};

export interface NetResult {
  pingMs: number;
  jitterMs: number;
  downloadMbps: number;
  uploadMbps: number;
}

export type NetVerdict = "good" | "limited" | "poor";

// The best quality this connection can carry, and whether it carries the one chosen.
export function judgeConnection(result: NetResult, chosen: "low" | "med" | "high"): { verdict: NetVerdict; best: "low" | "med" | "high" | null; messages: string[] } {
  const order: ("high" | "med" | "low")[] = ["high", "med", "low"];
  const best = order.find((q) => result.uploadMbps >= QUALITY_NEEDS[q].needMbps) ?? null;
  const messages: string[] = [];
  const need = QUALITY_NEEDS[chosen];

  let verdict: NetVerdict = "good";
  if (!best) {
    verdict = "poor";
    messages.push(`Upload speed is only ${result.uploadMbps.toFixed(1)} Mbps. Even Standard quality needs about ${QUALITY_NEEDS.low.needMbps} Mbps. Use a wired connection or a stronger network.`);
  } else if (result.uploadMbps < need.needMbps) {
    verdict = "limited";
    messages.push(`${need.label} needs about ${need.needMbps} Mbps upload and you have ${result.uploadMbps.toFixed(1)} Mbps. Choose ${QUALITY_NEEDS[best].label} or better the connection.`);
  } else {
    messages.push(`Upload speed (${result.uploadMbps.toFixed(1)} Mbps) is enough for ${need.label}.`);
  }
  if (result.pingMs > 250 || result.jitterMs > 80) {
    if (verdict === "good") verdict = "limited";
    messages.push(`The connection is unsteady (ping ${Math.round(result.pingMs)} ms, jitter ${Math.round(result.jitterMs)} ms). Prefer a wired connection over Wi-Fi.`);
  }
  if (result.downloadMbps < 5) {
    if (verdict === "good") verdict = "limited";
    messages.push(`Download speed is low (${result.downloadMbps.toFixed(1)} Mbps), which can hurt a live video room.`);
  }
  return { verdict, best, messages };
}

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Jitter: how much successive round trips differ.
export const jitter = (values: number[]) => (values.length < 2 ? 0 : values.slice(1).reduce((sum, v, i) => sum + Math.abs(v - values[i]), 0) / (values.length - 1));
