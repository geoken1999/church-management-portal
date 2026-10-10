// The member Home layout an admin designs in Design Studio, and the one
// place that decides what a valid layout is. Pure (no server-only) so the
// editor, the server actions and the tests all share it; the mobile app
// mirrors these shapes in lib/data/member_home_repository.dart.

export const LAYOUT_VERSION = 1;
export const MAX_BLOCKS = 20;
export const MAX_QUICK_LINKS = 8;

// Banner images are always exactly this size (2:1): the editor crops to it
// in the browser, the server rejects anything else, and the phone shows it
// edge to edge at this ratio, so every slide lines up with no stretching.
export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 600;
export const MAX_BANNER_SLIDES = 6;
export const MAX_BANNER_BYTES = 1024 * 1024;
export const BANNER_AUTOPLAY_OPTIONS = [0, 3, 5, 8] as const;
export const HOME_IMAGES_BUCKET = "member-home-images";

export interface BannerSlide {
  /** Storage path inside HOME_IMAGES_BUCKET: "{organization_id}/{uuid}.jpg" */
  imagePath: string;
  linkUrl: string;
}

export type BlockType = "banner" | "welcome" | "announcement" | "quick_links" | "upcoming_events";

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  banner: "Banner",
  welcome: "Welcome banner",
  announcement: "Announcement",
  quick_links: "Quick links",
  upcoming_events: "Upcoming events",
};

// Destinations a quick link can open that exist in the member app today.
// "url" opens any https link in the browser.
export const QUICK_LINK_TARGETS = [
  { key: "membership", label: "Membership QR code" },
  { key: "my_details", label: "My Details" },
  { key: "url", label: "Website link" },
] as const;
export type QuickLinkTarget = (typeof QUICK_LINK_TARGETS)[number]["key"];

export const QUICK_LINK_ICONS = ["qr", "user", "calendar", "heart", "gift", "book", "star", "people", "map", "phone", "link"] as const;
export type QuickLinkIcon = (typeof QUICK_LINK_ICONS)[number];

export interface QuickLink {
  label: string;
  icon: QuickLinkIcon;
  target: QuickLinkTarget;
  url?: string;
}

export type HomeBlock =
  | { id: string; hidden?: boolean; type: "banner"; slides: BannerSlide[]; autoplaySeconds: number }
  | { id: string; hidden?: boolean; type: "welcome"; title: string; subtitle: string }
  | { id: string; hidden?: boolean; type: "announcement"; title: string; body: string; imageUrl: string; buttonLabel: string; buttonUrl: string }
  | { id: string; hidden?: boolean; type: "quick_links"; title: string; links: QuickLink[] }
  | { id: string; hidden?: boolean; type: "upcoming_events"; title: string; count: number };

export interface HomeLayout {
  version: number;
  blocks: HomeBlock[];
}

export const DEFAULT_LAYOUT: HomeLayout = {
  version: LAYOUT_VERSION,
  blocks: [{ id: "welcome-default", type: "welcome", title: "", subtitle: "" }],
};

export function newBlock(type: BlockType): HomeBlock {
  const id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  switch (type) {
    case "banner":
      return { id, type, slides: [], autoplaySeconds: 5 };
    case "welcome":
      return { id, type, title: "", subtitle: "" };
    case "announcement":
      return { id, type, title: "", body: "", imageUrl: "", buttonLabel: "", buttonUrl: "" };
    case "quick_links":
      return { id, type, title: "Quick links", links: [{ label: "My Membership", icon: "qr", target: "membership" }] };
    case "upcoming_events":
      return { id, type, title: "Upcoming events", count: 3 };
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Turns untrusted JSON into a clean layout, or says what's wrong. Unknown
// fields are dropped, strings are trimmed and length-capped, and every URL
// must be https (members' phones will open and load these).
const BANNER_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

export function bannerImageUrl(supabaseUrl: string, imagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${HOME_IMAGES_BUCKET}/${imagePath}`;
}

export function sanitizeLayout(input: unknown, organizationId?: string): { layout: HomeLayout; error?: undefined } | { layout?: undefined; error: string } {
  if (!input || typeof input !== "object" || !Array.isArray((input as HomeLayout).blocks)) {
    return { error: "That layout isn't valid." };
  }
  const rawBlocks = (input as HomeLayout).blocks as unknown[];
  if (rawBlocks.length > MAX_BLOCKS) return { error: `A home page can have at most ${MAX_BLOCKS} sections.` };

  const blocks: HomeBlock[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawBlocks) {
    if (!raw || typeof raw !== "object") return { error: "That layout isn't valid." };
    const block = raw as Record<string, unknown>;
    const id = str(block.id, 64);
    if (!id || seenIds.has(id)) return { error: "That layout isn't valid." };
    seenIds.add(id);
    // A hidden section is kept in the layout but not shown to members, so
    // it may be unfinished (an empty announcement, a banner with no images
    // yet) without blocking a publish.
    const hidden = block.hidden === true;

    const imageUrl = str(block.imageUrl, 500);
    if (imageUrl && !isHttpsUrl(imageUrl)) return { error: "Image links must start with https://." };

    switch (block.type) {
      case "banner": {
        const rawSlides = Array.isArray(block.slides) ? (block.slides as unknown[]) : [];
        if (rawSlides.length === 0 && !hidden) return { error: "A banner needs at least one image." };
        if (rawSlides.length > MAX_BANNER_SLIDES) return { error: `A banner can have at most ${MAX_BANNER_SLIDES} images.` };
        const slides: BannerSlide[] = [];
        for (const rawSlide of rawSlides) {
          const slide = (rawSlide ?? {}) as Record<string, unknown>;
          const imagePath = str(slide.imagePath, 120);
          // Must be a file in this church's own folder, so a layout can't
          // point at (or later delete) another church's upload.
          if (!BANNER_PATH_PATTERN.test(imagePath) || (organizationId && !imagePath.startsWith(`${organizationId}/`))) {
            return { error: "One of the banner images isn't valid. Upload it again." };
          }
          const linkUrl = str(slide.linkUrl, 500);
          if (linkUrl && !isHttpsUrl(linkUrl)) return { error: "Banner links must start with https://." };
          slides.push({ imagePath, linkUrl });
        }
        const autoplay = Number(block.autoplaySeconds);
        const autoplaySeconds = (BANNER_AUTOPLAY_OPTIONS as readonly number[]).includes(autoplay) ? autoplay : 5;
        // Kept even for a single slide: the phone ignores it until there are
        // two, and zeroing it here silently turned autoplay off for anyone
        // who later added a second image.
        blocks.push({ id, ...(hidden && { hidden }), type: "banner", slides, autoplaySeconds });
        break;
      }
      case "welcome":
        blocks.push({ id, ...(hidden && { hidden }), type: "welcome", title: str(block.title, 80), subtitle: str(block.subtitle, 160) });
        break;
      case "announcement": {
        const title = str(block.title, 80);
        const body = str(block.body, 1000);
        if (!title && !body && !hidden) return { error: "An announcement needs a title or a message." };
        const buttonLabel = str(block.buttonLabel, 30);
        const buttonUrl = str(block.buttonUrl, 500);
        if ((buttonLabel && !buttonUrl) || (!buttonLabel && buttonUrl)) return { error: "An announcement button needs both a label and a link." };
        if (buttonUrl && !isHttpsUrl(buttonUrl)) return { error: "Button links must start with https://." };
        blocks.push({ id, ...(hidden && { hidden }), type: "announcement", title, body, imageUrl, buttonLabel, buttonUrl });
        break;
      }
      case "quick_links": {
        const rawLinks = Array.isArray(block.links) ? (block.links as unknown[]) : [];
        if (rawLinks.length === 0 && !hidden) return { error: "Quick links needs at least one link." };
        if (rawLinks.length > MAX_QUICK_LINKS) return { error: `Quick links can have at most ${MAX_QUICK_LINKS} links.` };
        const links: QuickLink[] = [];
        for (const rawLink of rawLinks) {
          const link = (rawLink ?? {}) as Record<string, unknown>;
          const label = str(link.label, 24);
          if (!label) return { error: "Every quick link needs a label." };
          const target = QUICK_LINK_TARGETS.find((t) => t.key === link.target)?.key;
          if (!target) return { error: `Choose where "${label}" goes.` };
          const icon = QUICK_LINK_ICONS.find((i) => i === link.icon) ?? "link";
          const url = str(link.url, 500);
          if (target === "url" && !isHttpsUrl(url)) return { error: `"${label}" needs a link starting with https://.` };
          links.push(target === "url" ? { label, icon, target, url } : { label, icon, target });
        }
        blocks.push({ id, ...(hidden && { hidden }), type: "quick_links", title: str(block.title, 60), links });
        break;
      }
      case "upcoming_events": {
        const count = Math.min(10, Math.max(1, Math.round(Number(block.count) || 3)));
        blocks.push({ id, ...(hidden && { hidden }), type: "upcoming_events", title: str(block.title, 60), count });
        break;
      }
      default:
        return { error: "That layout isn't valid." };
    }
  }

  return { layout: { version: LAYOUT_VERSION, blocks } };
}
