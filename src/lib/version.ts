// The web app's own version and the build it came from (set in next.config.ts).
export interface WebVersion {
  version: string;
  commit: string;
  commitShort: string;
  message: string;
  builtAt: string;
  environment: string;
}

export function getWebVersion(): WebVersion {
  const commit = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
  return {
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    commit,
    commitShort: commit.slice(0, 7),
    message: process.env.NEXT_PUBLIC_BUILD_MESSAGE ?? "",
    builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
    environment: process.env.NEXT_PUBLIC_BUILD_ENV ?? "",
  };
}

// Compares "1.2.3" style versions and build numbers; negative when a is older than b.
export function compareVersions(a: string, b: string, buildA = "0", buildB = "0"): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return (Number.parseInt(buildA, 10) || 0) - (Number.parseInt(buildB, 10) || 0);
}
