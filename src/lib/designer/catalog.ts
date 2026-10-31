import { emptyDoc, makeIcon, makeShape, makeText, newId, type DesignDoc, type DesignElement, type FontKey } from "./model";
import type { IconKey } from "./icons";

// The starter template library: categories and original layouts generated from code, so every template is an
// ordinary editable design (text, shapes and icons) with no borrowed artwork. A super admin installs them from the
// platform admin page; after that they live in the database and are managed there like any other template.

export interface CategorySpec {
  slug: string;
  name: string;
  group: string;
  /** Pixel sizes the starter templates for this category are made at. One layout per size, rotating through styles. */
  sizes: [number, number][];
  title: string;
  subtitle: string;
  detail: string;
  icon: IconKey;
  tags: string[];
}

const PORTRAIT: [number, number] = [1080, 1350];
const SQUARE: [number, number] = [1080, 1080];
const STORY: [number, number] = [1080, 1920];
const WIDE: [number, number] = [1280, 720];
const SLIDE: [number, number] = [1920, 1080];
const A4: [number, number] = [1240, 1754];
const A4_LANDSCAPE: [number, number] = [1754, 1240];

const CHURCH = "Church & Worship";
const ADMIN = "Church Administration";
const SOCIAL = "Social Media";
const OTHER = "Other Design Categories";

export const CATEGORIES: CategorySpec[] = [
  { slug: "sunday-worship", name: "Sunday Worship Service", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Sunday Worship", subtitle: "Join us as we worship together", detail: "Sunday  ·  9:30 AM", icon: "cross", tags: ["sunday", "service", "worship", "invitation"] },
  { slug: "special-worship", name: "Special Worship Service", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Special Worship Service", subtitle: "A day set apart for the Lord", detail: "Date  ·  Time  ·  Venue", icon: "crown", tags: ["special", "service", "worship"] },
  { slug: "prayer-meeting", name: "Prayer Meeting", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Prayer Meeting", subtitle: "Come as you are. Leave encouraged.", detail: "Friday  ·  7:00 PM", icon: "heart", tags: ["prayer", "meeting", "intercession"] },
  { slug: "fasting-prayer", name: "Fasting Prayer", group: CHURCH, sizes: [PORTRAIT, SQUARE, STORY], title: "Fasting Prayer", subtitle: "Seeking the Lord together", detail: "Start date  ·  End date", icon: "flame", tags: ["fasting", "prayer", "lent"] },
  { slug: "revival-meeting", name: "Revival Meeting", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Revival Meeting", subtitle: "Come and see what God will do", detail: "Dates  ·  6:30 PM daily", icon: "flame", tags: ["revival", "meeting", "gospel"] },
  { slug: "holy-communion", name: "Holy Communion", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Holy Communion", subtitle: "Do this in remembrance of me", detail: "First Sunday of the month", icon: "cross", tags: ["communion", "lord's supper", "sacrament"] },
  { slug: "baptism", name: "Baptism", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Baptism Service", subtitle: "Buried with Him, raised to walk in new life", detail: "Date  ·  Time", icon: "sun", tags: ["baptism", "water", "new life"] },
  { slug: "church-anniversary", name: "Church Anniversary", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Church Anniversary", subtitle: "Celebrating God's faithfulness", detail: "Date  ·  Venue", icon: "star", tags: ["anniversary", "celebration", "church"] },
  { slug: "pastor-appreciation", name: "Pastor Appreciation", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Pastor Appreciation", subtitle: "Thank you for shepherding us", detail: "Join us to honour our pastor", icon: "heart", tags: ["pastor", "appreciation", "thank you"] },
  { slug: "womens-fellowship", name: "Women's Fellowship", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Women's Fellowship", subtitle: "Growing together in faith", detail: "Saturday  ·  4:00 PM", icon: "heart", tags: ["women", "fellowship", "ladies"] },
  { slug: "mens-fellowship", name: "Men's Fellowship", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Men's Fellowship", subtitle: "Iron sharpens iron", detail: "Saturday  ·  7:00 AM", icon: "crown", tags: ["men", "fellowship", "brothers"] },
  { slug: "youth-meeting", name: "Youth Meeting", group: CHURCH, sizes: [PORTRAIT, SQUARE, STORY], title: "Youth Night", subtitle: "Games · Music · Word", detail: "Friday  ·  7:00 PM", icon: "burst", tags: ["youth", "teens", "young adults"] },
  { slug: "childrens-ministry", name: "Children's Ministry", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Children's Ministry", subtitle: "Sunday school for every child", detail: "Sunday  ·  9:30 AM", icon: "sun", tags: ["children", "kids", "sunday school"] },
  { slug: "bible-study", name: "Bible Study", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Bible Study", subtitle: "Open the Word together", detail: "Wednesday  ·  7:00 PM", icon: "book", tags: ["bible", "study", "word"] },
  { slug: "bible-school", name: "Bible School", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Vacation Bible School", subtitle: "A week of fun, songs and stories", detail: "Dates  ·  9:00 AM – 12:00 PM", icon: "book", tags: ["vbs", "bible school", "kids"] },
  { slug: "christmas-celebration", name: "Christmas Celebration", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Christmas Celebration", subtitle: "Carols, candlelight and the good news", detail: "December 24  ·  6:30 PM", icon: "star", tags: ["christmas", "carol", "nativity"] },
  { slug: "easter-celebration", name: "Easter Celebration", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "He Is Risen", subtitle: "Easter Sunday worship", detail: "Sunrise service  ·  6:00 AM", icon: "sun", tags: ["easter", "resurrection", "risen"] },
  { slug: "good-friday", name: "Good Friday", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Good Friday Service", subtitle: "It is finished", detail: "Friday  ·  10:00 AM", icon: "cross", tags: ["good friday", "cross", "passion"] },
  { slug: "new-year-service", name: "New Year Service", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "New Year Watch Night", subtitle: "Entering the year with prayer and praise", detail: "December 31  ·  10:00 PM", icon: "star", tags: ["new year", "watch night", "prayer"] },
  { slug: "harvest-festival", name: "Harvest Festival", group: CHURCH, sizes: [PORTRAIT, SQUARE, WIDE], title: "Harvest Festival", subtitle: "Giving thanks for God's provision", detail: "Date  ·  Venue", icon: "sun", tags: ["harvest", "thanksgiving", "festival"] },

  { slug: "church-announcements", name: "Church Announcements", group: ADMIN, sizes: [PORTRAIT, SQUARE, SLIDE], title: "Announcements", subtitle: "What's happening this week", detail: "Add your announcements here", icon: "bubble", tags: ["announcement", "notice", "news"] },
  { slug: "weekly-schedule", name: "Weekly Schedule", group: ADMIN, sizes: [PORTRAIT, SQUARE, SLIDE], title: "This Week at Church", subtitle: "Services and meetings", detail: "Sun 9:30 AM  ·  Wed 7 PM  ·  Fri 7 PM", icon: "calendar", tags: ["schedule", "timetable", "week"] },
  { slug: "monthly-calendar", name: "Monthly Calendar", group: ADMIN, sizes: [PORTRAIT, A4, SLIDE], title: "Month at a Glance", subtitle: "Dates to remember", detail: "Add your events", icon: "calendar", tags: ["calendar", "month", "events"] },
  { slug: "event-registration", name: "Event Registration", group: ADMIN, sizes: [PORTRAIT, SQUARE, STORY], title: "Register Now", subtitle: "Reserve your place", detail: "Register at the church office or online", icon: "check", tags: ["registration", "sign up", "rsvp"] },
  { slug: "volunteer-recruitment", name: "Volunteer Recruitment", group: ADMIN, sizes: [PORTRAIT, SQUARE, STORY], title: "We Need You", subtitle: "Serve with us", detail: "Talk to a team leader today", icon: "heart", tags: ["volunteer", "serve", "team"] },
  { slug: "donation-campaign", name: "Donation Campaign", group: ADMIN, sizes: [PORTRAIT, SQUARE, STORY], title: "Give with a Joyful Heart", subtitle: "Support the work of the ministry", detail: "Give online or at the church", icon: "heart", tags: ["donation", "giving", "offering", "tithe"] },
  { slug: "fundraising", name: "Fundraising", group: ADMIN, sizes: [PORTRAIT, SQUARE, STORY], title: "Building Fund", subtitle: "Help us reach our goal", detail: "Goal  ·  Raised so far", icon: "star", tags: ["fundraising", "building fund", "campaign"] },
  { slug: "community-outreach", name: "Community Outreach", group: ADMIN, sizes: [PORTRAIT, SQUARE, WIDE], title: "Community Outreach", subtitle: "Serving our neighbours in love", detail: "Saturday  ·  Meet at the church", icon: "heart", tags: ["outreach", "community", "service"] },
  { slug: "mission-trip", name: "Mission Trip", group: ADMIN, sizes: [PORTRAIT, SQUARE, WIDE], title: "Mission Trip", subtitle: "Go and make disciples", detail: "Dates  ·  Destination", icon: "pin", tags: ["mission", "trip", "missionary"] },
  { slug: "leadership-meeting", name: "Leadership Meeting", group: ADMIN, sizes: [PORTRAIT, SQUARE, SLIDE], title: "Leadership Meeting", subtitle: "Vision, planning and prayer", detail: "Date  ·  Time  ·  Venue", icon: "crown", tags: ["leadership", "meeting", "elders"] },

  { slug: "instagram-post", name: "Instagram Post", group: SOCIAL, sizes: [SQUARE, PORTRAIT, SQUARE], title: "Sunday Service", subtitle: "Join us in person or online", detail: "9:30 AM", icon: "cross", tags: ["instagram", "post", "social"] },
  { slug: "instagram-story", name: "Instagram Story", group: SOCIAL, sizes: [STORY, STORY, STORY], title: "This Sunday", subtitle: "We'd love to see you", detail: "9:30 AM", icon: "sun", tags: ["instagram", "story", "vertical"] },
  { slug: "facebook-post", name: "Facebook Post", group: SOCIAL, sizes: [[1200, 1200], [1200, 1200], [1200, 1200]], title: "Join Us This Week", subtitle: "Worship · Word · Fellowship", detail: "Sunday  ·  9:30 AM", icon: "cross", tags: ["facebook", "post", "social"] },
  { slug: "facebook-cover", name: "Facebook Cover", group: SOCIAL, sizes: [[1640, 624], [1640, 624], [1640, 624]], title: "Welcome to Our Church", subtitle: "A place to belong", detail: "Sundays at 9:30 AM", icon: "cross", tags: ["facebook", "cover", "banner"] },
  { slug: "youtube-thumbnail", name: "YouTube Thumbnail", group: SOCIAL, sizes: [WIDE, WIDE, WIDE], title: "Sunday Message", subtitle: "Watch the full sermon", detail: "Pastor name", icon: "cross", tags: ["youtube", "thumbnail", "sermon", "video"] },
  { slug: "youtube-banner", name: "YouTube Channel Banner", group: SOCIAL, sizes: [[2560, 1440], [2560, 1440], [2560, 1440]], title: "Our Church Channel", subtitle: "Sermons · Worship · Live services", detail: "New videos every week", icon: "music", tags: ["youtube", "banner", "channel"] },
  { slug: "whatsapp-status", name: "WhatsApp Status", group: SOCIAL, sizes: [STORY, STORY, STORY], title: "Good Morning", subtitle: "The Lord is good to all", detail: "Have a blessed day", icon: "sun", tags: ["whatsapp", "status", "greeting"] },
  { slug: "whatsapp-announcement", name: "WhatsApp Announcement", group: SOCIAL, sizes: [SQUARE, PORTRAIT, SQUARE], title: "Important Notice", subtitle: "Please share with the congregation", detail: "Add your message", icon: "bubble", tags: ["whatsapp", "announcement", "notice"] },

  { slug: "invitations", name: "Invitations", group: OTHER, sizes: [PORTRAIT, A4, SQUARE], title: "You Are Invited", subtitle: "Please join us to celebrate", detail: "Date  ·  Time  ·  Venue", icon: "star", tags: ["invitation", "invite", "wedding", "dedication"] },
  { slug: "certificates", name: "Certificates", group: OTHER, sizes: [A4_LANDSCAPE, A4_LANDSCAPE, A4_LANDSCAPE], title: "Certificate of Completion", subtitle: "This certificate is proudly presented to", detail: "Name of recipient", icon: "crown", tags: ["certificate", "award", "completion", "baptism"] },
  { slug: "event-tickets", name: "Event Tickets", group: OTHER, sizes: [[1200, 500], [1200, 500], [1200, 500]], title: "Admit One", subtitle: "Event name", detail: "Date  ·  Time  ·  Venue", icon: "check", tags: ["ticket", "pass", "entry"] },
  { slug: "presentation-slides", name: "Presentation Slides", group: OTHER, sizes: [SLIDE, SLIDE, SLIDE], title: "Slide Title", subtitle: "Add your message here", detail: "Speaker  ·  Date", icon: "book", tags: ["slide", "presentation", "sermon"] },
  { slug: "sermon-series", name: "Sermon Series Graphics", group: OTHER, sizes: [WIDE, SQUARE, SLIDE], title: "Series Title", subtitle: "A new sermon series", detail: "Starts Sunday  ·  Week 1 of 6", icon: "book", tags: ["sermon", "series", "message"] },
  { slug: "scripture-verse", name: "Scripture Verse Graphics", group: OTHER, sizes: [SQUARE, PORTRAIT, STORY], title: "“Your word is a lamp to my feet and a light to my path.”", subtitle: "PSALM 119:105", detail: "", icon: "book", tags: ["verse", "scripture", "bible", "quote"] },
  { slug: "church-newsletter", name: "Church Newsletter", group: OTHER, sizes: [A4, A4, A4], title: "Church Newsletter", subtitle: "News, events and encouragement", detail: "Issue  ·  Month Year", icon: "mail", tags: ["newsletter", "bulletin", "news"] },
  { slug: "digital-posters", name: "Digital Posters", group: OTHER, sizes: [PORTRAIT, STORY, A4], title: "Big Event", subtitle: "You don't want to miss this", detail: "Date  ·  Time  ·  Venue", icon: "burst", tags: ["poster", "digital", "event"] },
  { slug: "livestream-backgrounds", name: "Livestream Backgrounds", group: OTHER, sizes: [SLIDE, SLIDE, SLIDE], title: "Starting Soon", subtitle: "Our service begins shortly", detail: "Welcome to our online family", icon: "sun", tags: ["livestream", "background", "starting soon", "online"] },
];

interface Palette {
  name: string;
  bgA: string;
  bgB: string;
  accent: string;
  text: string;
  muted: string;
  light: string;
  ink: string;
}

const PALETTES: Palette[] = [
  { name: "navy-gold", bgA: "#1f2a44", bgB: "#0b1222", accent: "#f5c518", text: "#ffffff", muted: "#b9c2d8", light: "#faf6ea", ink: "#1f2a44" },
  { name: "royal-purple", bgA: "#3a1c71", bgB: "#16062e", accent: "#ffd166", text: "#ffffff", muted: "#d4c3f5", light: "#f6f1ff", ink: "#2d1457" },
  { name: "forest", bgA: "#0f4c3a", bgB: "#06241b", accent: "#e9c46a", text: "#ffffff", muted: "#bfe3d4", light: "#f2f7f1", ink: "#0f3d2f" },
  { name: "sunrise", bgA: "#c2410c", bgB: "#7c2d12", accent: "#fde68a", text: "#ffffff", muted: "#fed7aa", light: "#fff7ed", ink: "#7c2d12" },
  { name: "crimson", bgA: "#9b1c31", bgB: "#4a0d19", accent: "#f9d56e", text: "#ffffff", muted: "#f4c2cb", light: "#fff5f5", ink: "#6b1423" },
  { name: "ocean", bgA: "#0e5a8a", bgB: "#06304d", accent: "#ffd23f", text: "#ffffff", muted: "#bfe0f5", light: "#f0f8ff", ink: "#0a3d5f" },
  { name: "charcoal", bgA: "#2b2b2b", bgB: "#0d0d0d", accent: "#ff6b35", text: "#ffffff", muted: "#c4c4c4", light: "#f5f5f4", ink: "#1c1c1c" },
  { name: "rose", bgA: "#be185d", bgB: "#500724", accent: "#fbcfe8", text: "#ffffff", muted: "#fbcfe8", light: "#fff1f7", ink: "#831843" },
];

const STYLES = ["bold", "elegant", "split"] as const;
type Style = (typeof STYLES)[number];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export interface StarterTemplate {
  slug: string;
  categorySlug: string;
  title: string;
  width: number;
  height: number;
  tags: string[];
  isPremium: boolean;
  featuredRank: number;
  doc: DesignDoc;
}

interface Ctx {
  w: number;
  h: number;
  /** Type scales with the shorter side so one layout works on portrait, square and wide pages. */
  u: number;
  spec: CategorySpec;
  p: Palette;
  church: string;
}

function lineCount(value: string, fontSize: number, boxWidth: number, factor: number): number {
  let lines = 0;
  for (const part of value.split("\n")) lines += Math.max(1, Math.ceil((part.length * fontSize * factor) / boxWidth));
  return lines;
}

function textEl(ctx: Ctx, value: string, y: number, sizeFrac: number, patch: Partial<DesignElement> & { factor?: number } = {}): DesignElement {
  const { factor = 0.55, ...rest } = patch;
  const fontSize = Math.round(ctx.u * sizeFrac);
  const w = rest.w ?? Math.round(ctx.w * 0.84);
  const x = rest.x ?? Math.round((ctx.w - w) / 2);
  const lineHeight = rest.lineHeight ?? 1.15;
  const el = makeText({ width: ctx.w, height: ctx.h }, value, { fontSize, x, w, y: Math.round(y), lineHeight, ...rest });
  el.h = Math.round(fontSize * lineHeight * lineCount(value, fontSize, w, factor));
  return el;
}

/** Lays text elements out one under another, centred vertically on the page, and returns where each one starts. */
function stack(ctx: Ctx, heights: number[], gaps: number[], top?: number): number[] {
  const total = heights.reduce((s, v) => s + v, 0) + gaps.reduce((s, v) => s + v, 0);
  let y = top ?? Math.max(ctx.h * 0.06, (ctx.h - total) / 2);
  return heights.map((height, i) => {
    const at = y;
    y += height + (gaps[i] ?? 0);
    return at;
  });
}

function fontFor(spec: CategorySpec, style: Style): FontKey {
  if (style === "elegant") return "playfair";
  return spec.group === SOCIAL || style === "bold" ? "anton" : "montserrat";
}

function bold(ctx: Ctx): DesignElement[] {
  const { w, h, u, spec, p } = ctx;
  const heading = fontFor(spec, "bold");
  const isVerse = spec.slug === "scripture-verse";
  const titleSize = isVerse ? 0.07 : 0.115;
  const title = textEl(ctx, isVerse ? spec.title : spec.title.toUpperCase(), 0, titleSize, { fill: p.text, fontFamily: isVerse ? "lora" : heading, italic: isVerse, lineHeight: 1.05, factor: isVerse ? 0.5 : 0.48 });
  const kicker = textEl(ctx, spec.group === SOCIAL ? spec.name.toUpperCase() : (ctx.church || "Your church").toUpperCase(), 0, 0.03, { fill: p.accent, fontWeight: 700, letterSpacing: 6 });
  const sub = textEl(ctx, spec.subtitle, 0, isVerse ? 0.04 : 0.042, { fill: isVerse ? p.accent : p.muted, fontWeight: isVerse ? 700 : 400, letterSpacing: isVerse ? 6 : 0 });
  const bar = Math.round(u * 0.012);
  const hasDetail = spec.detail.trim() !== "";
  const pillH = Math.round(u * 0.095);
  const items = [kicker.h, title.h, bar, sub.h, ...(hasDetail ? [pillH] : [])];
  const ys = stack(ctx, items, [u * 0.03, u * 0.035, u * 0.035, u * 0.045]);
  kicker.y = Math.round(ys[0]);
  title.y = Math.round(ys[1]);
  const barEl = makeShape("rect", { width: w, height: h }, { x: Math.round(w / 2 - u * 0.09), y: Math.round(ys[2]), w: Math.round(u * 0.18), h: bar, fill: p.accent });
  sub.y = Math.round(ys[3]);
  const out: DesignElement[] = [
    makeShape("ellipse", { width: w, height: h }, { x: Math.round(w * 0.5 - u * 0.55), y: Math.round(h * 0.5 - u * 0.55), w: Math.round(u * 1.1), h: Math.round(u * 1.1), fill: p.accent, opacity: 0.12 }),
    makeIcon({ width: w, height: h }, spec.icon, { x: Math.round(w - u * 0.3), y: Math.round(u * 0.05), w: Math.round(u * 0.22), h: Math.round(u * 0.22), fill: p.accent, opacity: 0.35 }),
    kicker,
    title,
    barEl,
    sub,
  ];
  if (hasDetail) {
    const pillW = Math.round(w * 0.62);
    out.push(
      makeShape("rect", { width: w, height: h }, { x: Math.round((w - pillW) / 2), y: Math.round(ys[4]), w: pillW, h: pillH, fill: p.accent, radius: Math.round(pillH / 2) }),
      textEl(ctx, spec.detail, ys[4] + (pillH - u * 0.035 * 1.15) / 2, 0.035, { x: Math.round((w - pillW) / 2), w: pillW, fill: p.ink, fontWeight: 700 }),
    );
  }
  return out;
}

function elegant(ctx: Ctx): DesignElement[] {
  const { w, h, u, spec, p } = ctx;
  const inset = Math.round(u * 0.05);
  const isVerse = spec.slug === "scripture-verse";
  const title = textEl(ctx, spec.title, 0, isVerse ? 0.065 : 0.085, { fill: p.ink, fontFamily: "playfair", fontWeight: 700, italic: isVerse, lineHeight: 1.12, w: Math.round(w * 0.72), factor: 0.55 });
  const sub = textEl(ctx, spec.subtitle, 0, isVerse ? 0.034 : 0.038, { fill: p.accent === "#f5c518" ? "#8a6d3b" : p.bgA, fontFamily: isVerse ? "montserrat" : "lora", italic: !isVerse, fontWeight: isVerse ? 700 : 400, letterSpacing: isVerse ? 6 : 0, w: Math.round(w * 0.72) });
  const detail = textEl(ctx, spec.detail, 0, 0.034, { fill: p.ink, fontFamily: "montserrat", fontWeight: 700, letterSpacing: 3, w: Math.round(w * 0.72) });
  const hasDetail = spec.detail.trim() !== "";
  const iconSize = Math.round(u * 0.12);
  const church = textEl(ctx, (ctx.church || "Your church").toUpperCase(), 0, 0.022, { fill: p.bgA, fontFamily: "montserrat", fontWeight: 700, letterSpacing: 6 });
  const items = [iconSize, title.h, 4, sub.h, ...(hasDetail ? [detail.h] : [])];
  const ys = stack(ctx, items, [u * 0.04, u * 0.035, u * 0.03, u * 0.05]);
  title.y = Math.round(ys[1]);
  sub.y = Math.round(ys[3]);
  detail.y = Math.round(ys[4] ?? 0);
  church.y = Math.round(h - inset - u * 0.07);
  const out: DesignElement[] = [
    makeShape("rect", { width: w, height: h }, { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2, fill: "#00000000", stroke: p.bgA, strokeWidth: 3 }),
    makeShape("rect", { width: w, height: h }, { x: inset * 2, y: inset * 2, w: w - inset * 4, h: h - inset * 4, fill: "#00000000", stroke: p.accent, strokeWidth: 2 }),
    makeIcon({ width: w, height: h }, spec.icon, { x: Math.round((w - iconSize) / 2), y: Math.round(ys[0]), w: iconSize, h: iconSize, fill: p.bgA }),
    title,
    makeShape("rect", { width: w, height: h }, { x: Math.round(w / 2 - u * 0.12), y: Math.round(ys[2]), w: Math.round(u * 0.24), h: 4, fill: p.accent }),
    sub,
  ];
  if (hasDetail) out.push(detail);
  out.push(church);
  return out;
}

function split(ctx: Ctx): DesignElement[] {
  const { w, h, u, spec, p } = ctx;
  const panelX = Math.round(w * 0.62);
  const left = Math.round(w * 0.07);
  const textW = Math.round(w * 0.5);
  const isVerse = spec.slug === "scripture-verse";
  const kicker = textEl(ctx, spec.name.toUpperCase(), 0, 0.026, { x: left, w: textW, align: "left", fill: p.accent, fontWeight: 700, letterSpacing: 5, factor: 0.7 });
  const title = textEl(ctx, isVerse ? spec.title : spec.title.toUpperCase(), 0, isVerse ? 0.055 : 0.088, { x: left, w: textW, align: "left", fill: p.text, fontFamily: isVerse ? "lora" : "montserrat", fontWeight: 900, italic: isVerse, lineHeight: 1.05, factor: isVerse ? 0.5 : 0.72 });
  const sub = textEl(ctx, spec.subtitle, 0, 0.034, { x: left, w: textW, align: "left", fill: p.muted });
  const detail = textEl(ctx, spec.detail, 0, 0.032, { x: left, w: textW, align: "left", fill: p.accent, fontWeight: 700 });
  const hasDetail = spec.detail.trim() !== "";
  const ys = stack(ctx, [kicker.h, title.h, sub.h, ...(hasDetail ? [detail.h] : [])], [u * 0.03, u * 0.03, u * 0.04]);
  kicker.y = Math.round(ys[0]);
  title.y = Math.round(ys[1]);
  sub.y = Math.round(ys[2]);
  detail.y = Math.round(ys[3] ?? 0);
  const panelW = w - panelX;
  const disc = Math.round(Math.min(panelW * 0.8, h * 0.6));
  const out: DesignElement[] = [
    makeShape("rect", { width: w, height: h }, { x: panelX, y: 0, w: panelW, h, fill: p.accent }),
    makeShape("ellipse", { width: w, height: h }, { x: Math.round(panelX + (panelW - disc) / 2), y: Math.round((h - disc) / 2), w: disc, h: disc, fill: p.bgA }),
    makeIcon({ width: w, height: h }, spec.icon, { x: Math.round(panelX + (panelW - disc * 0.5) / 2), y: Math.round((h - disc * 0.5) / 2), w: Math.round(disc * 0.5), h: Math.round(disc * 0.5), fill: p.accent }),
    kicker,
    title,
    sub,
  ];
  if (hasDetail) out.push(detail);
  out.push(textEl(ctx, ctx.church || "Your church", h - u * 0.09, 0.022, { x: left, w: textW, align: "left", fill: p.muted }));
  return out;
}

function background(style: Style, p: Palette, angle: number): DesignDoc["background"] {
  if (style === "elegant") return { type: "gradient", color: p.light, color2: "#ffffff", angle };
  if (style === "split") return { type: "solid", color: p.bgA };
  return { type: "gradient", color: p.bgA, color2: p.bgB, angle };
}

export function buildStarterDoc(spec: CategorySpec, style: Style, width: number, height: number, paletteIndex: number, church = "Your church"): DesignDoc {
  const p = PALETTES[paletteIndex % PALETTES.length];
  const ctx: Ctx = { w: width, h: height, u: Math.min(width, height * 1.25), spec, p, church };
  const doc = emptyDoc(width, height);
  doc.background = background(style, p, 160);
  doc.elements = (style === "bold" ? bold(ctx) : style === "elegant" ? elegant(ctx) : split(ctx)).map((e) => ({ ...e, id: newId() }));
  return doc;
}

/** Every starter template: each category in each of its sizes, in two looks, rotating through the three styles and the palettes. */
export function buildStarterTemplates(): StarterTemplate[] {
  const out: StarterTemplate[] = [];
  for (const spec of CATEGORIES) {
    spec.sizes.forEach(([width, height], index) => {
      for (let look = 0; look < 2; look++) {
        const style = STYLES[(index + look) % STYLES.length];
        const paletteIndex = (hash(`${spec.slug}-${index}`) + look * 3) % PALETTES.length;
        const palette = PALETTES[paletteIndex];
        out.push({
          slug: `${spec.slug}-${index + 1}-${look + 1}-${style}-${palette.name}`,
          categorySlug: spec.slug,
          title: `${spec.name} · ${style === "bold" ? "Bold" : style === "elegant" ? "Elegant" : "Split"} ${palette.name.split("-")[0]}`,
          width,
          height,
          tags: [...spec.tags, style, palette.name.split("-")[0]],
          // The elegant layouts are the premium ones.
          isPremium: style === "elegant",
          featuredRank: spec.group === CHURCH && index === 0 && look === 0 ? 10 : 0,
          doc: buildStarterDoc(spec, style, width, height, paletteIndex),
        });
      }
    });
  }
  return out;
}

export function orientationOf(width: number, height: number): "landscape" | "portrait" | "square" {
  if (Math.abs(width - height) / Math.max(width, height) < 0.05) return "square";
  return width > height ? "landscape" : "portrait";
}
