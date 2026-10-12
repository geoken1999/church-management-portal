// Reading a YouTube video's id from the link a church pastes. Pure, so it is
// testable and shared by the editor, the server and the tests; the mobile app
// mirrors it in lib/data/member_home_repository.dart.

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const [, kind, id] = url.pathname.split("/");
      if (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v") candidate = id ?? null;
    }
  }
  return candidate && ID_PATTERN.test(candidate) ? candidate : null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// The thumbnail YouTube serves for any video, no key needed.
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
