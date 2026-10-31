import { emptyDoc, makeShape, makeText, newId, type DesignDoc, type DesignElement } from "./model";

// Starting points for a new design. Each one is laid out in proportions of the page, so it fits any size you pick.

export interface DesignTemplate {
  key: string;
  label: string;
  description: string;
  /** Two colours for the picker's preview swatch. */
  swatch: [string, string];
  build: (width: number, height: number, churchName: string) => DesignDoc;
}

function text(doc: DesignDoc, value: string, y: number, size: number, patch: Partial<DesignElement> = {}): DesignElement {
  const fontSize = Math.round(doc.width * size);
  const el = makeText(doc, value, { fontSize, y: Math.round(doc.height * y), ...patch });
  el.h = Math.round(fontSize * (el.lineHeight ?? 1.2) * Math.max(1, value.split("\n").length));
  return el;
}

function band(doc: DesignDoc, y: number, h: number, fill: string): DesignElement {
  return makeShape("rect", doc, { x: 0, y: Math.round(doc.height * y), w: doc.width, h: Math.round(doc.height * h), fill });
}

export const TEMPLATES: DesignTemplate[] = [
  {
    key: "blank",
    label: "Blank",
    description: "Start from an empty page",
    swatch: ["#ffffff", "#e5e5e5"],
    build: (w, h) => emptyDoc(w, h),
  },
  {
    key: "sunday",
    label: "Sunday service",
    description: "Weekly service invitation",
    swatch: ["#1f2a44", "#F5C518"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#1f2a44", color2: "#0f1626", angle: 170 };
      doc.elements = [
        text(doc, church.toUpperCase(), 0.07, 0.04, { fill: "#F5C518", fontWeight: 700, letterSpacing: 6 }),
        text(doc, "Join us this\nSunday", 0.2, 0.13, { fill: "#ffffff", fontFamily: "display", lineHeight: 1.05 }),
        makeShape("rect", doc, { x: Math.round(w * 0.4), y: Math.round(h * 0.47), w: Math.round(w * 0.2), h: 8, fill: "#F5C518" }),
        text(doc, "Worship  ·  Word  ·  Fellowship", 0.51, 0.04, { fill: "#e8ecf5" }),
        text(doc, "9:30 AM", 0.64, 0.11, { fill: "#F5C518", fontFamily: "display" }),
        text(doc, "Everyone is welcome", 0.78, 0.045, { fill: "#ffffff", fontFamily: "serif", italic: true }),
        text(doc, "Add your address and phone number here", 0.9, 0.032, { fill: "#b9c2d8" }),
      ];
      return doc;
    },
  },
  {
    key: "event",
    label: "Event poster",
    description: "Big date, title and venue",
    swatch: ["#F5C518", "#111111"],
    build: (w, h) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "solid", color: "#F5C518" };
      doc.elements = [
        band(doc, 0, 0.12, "#111111"),
        text(doc, "YOU ARE INVITED", 0.035, 0.045, { fill: "#F5C518", fontWeight: 700, letterSpacing: 8 }),
        text(doc, "EVENT\nNAME", 0.2, 0.2, { fill: "#111111", fontFamily: "display", lineHeight: 0.95 }),
        makeShape("ellipse", doc, { x: Math.round(w * 0.3), y: Math.round(h * 0.55), w: Math.round(w * 0.4), h: Math.round(w * 0.4), fill: "#111111" }),
        text(doc, "SAT", 0.6, 0.06, { fill: "#F5C518", fontWeight: 700 }),
        text(doc, "12", 0.65, 0.17, { fill: "#ffffff", fontFamily: "display" }),
        text(doc, "Venue name, City  ·  6:00 PM", 0.9, 0.04, { fill: "#111111", fontWeight: 700 }),
      ];
      return doc;
    },
  },
  {
    key: "verse",
    label: "Bible verse",
    description: "A verse on a calm background",
    swatch: ["#f6efe3", "#8a6d3b"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#f6efe3", color2: "#e8d9bd", angle: 160 };
      doc.elements = [
        text(doc, "“", 0.1, 0.25, { fill: "#8a6d3b", fontFamily: "serif" }),
        text(doc, "For God so loved the world that he gave his one and only Son.", 0.32, 0.065, { fill: "#3b2f1b", fontFamily: "serif", italic: true, lineHeight: 1.35 }),
        text(doc, "JOHN 3:16", 0.66, 0.04, { fill: "#8a6d3b", fontWeight: 700, letterSpacing: 8 }),
        text(doc, church, 0.9, 0.032, { fill: "#8a6d3b" }),
      ];
      return doc;
    },
  },
  {
    key: "prayer",
    label: "Prayer night",
    description: "Dark, quiet, centred",
    swatch: ["#2b1b4d", "#c9a7ff"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#2b1b4d", color2: "#0d0820", angle: 180 };
      doc.elements = [
        makeShape("ellipse", doc, { x: Math.round(w * 0.2), y: Math.round(h * 0.08), w: Math.round(w * 0.6), h: Math.round(w * 0.6), fill: "#3d2a73", opacity: 0.6 }),
        text(doc, "NIGHT OF", 0.27, 0.05, { fill: "#c9a7ff", fontWeight: 700, letterSpacing: 10 }),
        text(doc, "Prayer", 0.32, 0.2, { fill: "#ffffff", fontFamily: "script" }),
        text(doc, "Friday  ·  8:00 PM", 0.68, 0.055, { fill: "#ffffff", fontWeight: 700 }),
        text(doc, "Come as you are. Leave encouraged.", 0.78, 0.04, { fill: "#d9c7ff", fontFamily: "serif", italic: true }),
        text(doc, church, 0.92, 0.03, { fill: "#a58be0" }),
      ];
      return doc;
    },
  },
  {
    key: "youth",
    label: "Youth night",
    description: "Loud and colourful",
    swatch: ["#ff4d6d", "#4cc9f0"],
    build: (w, h) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#ff4d6d", color2: "#7209b7", angle: 150 };
      doc.elements = [
        makeShape("ellipse", doc, { x: Math.round(w * -0.15), y: Math.round(h * 0.55), w: Math.round(w * 0.7), h: Math.round(w * 0.7), fill: "#4cc9f0", opacity: 0.85 }),
        text(doc, "YOUTH", 0.1, 0.22, { fill: "#ffffff", fontFamily: "display" }),
        text(doc, "NIGHT", 0.27, 0.22, { fill: "#ffe66d", fontFamily: "display" }),
        text(doc, "Games · Music · Word · Pizza", 0.52, 0.045, { fill: "#ffffff", fontWeight: 700 }),
        text(doc, "FRI  7 PM", 0.78, 0.1, { fill: "#ffffff", fontFamily: "display" }),
        text(doc, "Ages 13 – 25", 0.9, 0.04, { fill: "#ffe66d", fontWeight: 700 }),
      ];
      return doc;
    },
  },
  {
    key: "christmas",
    label: "Christmas",
    description: "Carols and candlelight",
    swatch: ["#0b3d2e", "#d4af37"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#0b3d2e", color2: "#062219", angle: 170 };
      doc.elements = [
        makeShape("rect", doc, { x: Math.round(w * 0.06), y: Math.round(h * 0.04), w: Math.round(w * 0.88), h: Math.round(h * 0.92), fill: "#00000000", stroke: "#d4af37", strokeWidth: 4 }),
        text(doc, "CHRISTMAS", 0.14, 0.05, { fill: "#d4af37", fontWeight: 700, letterSpacing: 12 }),
        text(doc, "Carol\nService", 0.22, 0.15, { fill: "#ffffff", fontFamily: "script", lineHeight: 1.0 }),
        text(doc, "Dec 24  ·  6:30 PM", 0.62, 0.06, { fill: "#d4af37", fontFamily: "serif" }),
        text(doc, "Come celebrate the birth of our Saviour", 0.74, 0.038, { fill: "#e9f2ee", fontFamily: "serif", italic: true }),
        text(doc, church, 0.88, 0.032, { fill: "#d4af37" }),
      ];
      return doc;
    },
  },
  {
    key: "thumb-sermon",
    label: "Sermon thumbnail",
    description: "YouTube: title, series and a photo",
    swatch: ["#10213f", "#ffd23f"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#10213f", color2: "#050b18", angle: 120 };
      const left = Math.round(w * 0.05);
      const textW = Math.round(w * 0.55);
      doc.elements = [
        makeShape("rect", doc, { x: Math.round(w * 0.62), y: 0, w: Math.round(w * 0.38), h, fill: "#1d3a6e" }),
        makeShape("ellipse", doc, { x: Math.round(w * 0.64), y: Math.round(h * 0.12), w: Math.round(w * 0.33), h: Math.round(w * 0.33), fill: "#ffd23f", opacity: 0.9 }),
        text(doc, "ADD YOUR\nPHOTO", 0.36, 0.035, { x: Math.round(w * 0.64), w: Math.round(w * 0.33), fill: "#10213f", fontFamily: "display", lineHeight: 1.1 }),
        text(doc, "SUNDAY MESSAGE", 0.1, 0.03, { x: left, w: textW, align: "left", fill: "#ffd23f", fontWeight: 700, letterSpacing: 6 }),
        text(doc, "SERMON\nTITLE\nHERE", 0.2, 0.115, { x: left, w: textW, align: "left", fill: "#ffffff", fontFamily: "anton", lineHeight: 1.0 }),
        makeShape("rect", doc, { x: left, y: Math.round(h * 0.82), w: Math.round(w * 0.3), h: Math.round(h * 0.09), fill: "#ffd23f" }),
        text(doc, "JOHN 3:16", 0.835, 0.032, { x: left, w: Math.round(w * 0.3), fill: "#10213f", fontWeight: 700 }),
        text(doc, church.toUpperCase(), 0.94, 0.017, { x: left, w: textW, align: "left", fill: "#9fb3d9", letterSpacing: 4 }),
      ];
      return doc;
    },
  },
  {
    key: "thumb-live",
    label: "Live service thumbnail",
    description: "YouTube: a red LIVE tag and the service",
    swatch: ["#d00000", "#111111"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#1a1a1a", color2: "#000000", angle: 150 };
      doc.elements = [
        makeShape("ellipse", doc, { x: Math.round(w * 0.55), y: Math.round(h * -0.35), w: Math.round(w * 0.7), h: Math.round(w * 0.7), fill: "#d00000", opacity: 0.55 }),
        makeShape("rect", doc, { x: Math.round(w * 0.05), y: Math.round(h * 0.09), w: Math.round(w * 0.17), h: Math.round(h * 0.15), fill: "#e10600", radius: 12 }),
        text(doc, "LIVE", 0.115, 0.07, { x: Math.round(w * 0.05), w: Math.round(w * 0.17), fill: "#ffffff", fontFamily: "anton" }),
        text(doc, "SUNDAY\nWORSHIP\nSERVICE", 0.3, 0.115, { x: Math.round(w * 0.05), w: Math.round(w * 0.75), align: "left", fill: "#ffffff", fontFamily: "anton", lineHeight: 1.0 }),
        text(doc, "9:30 AM  ·  JOIN US ONLINE", 0.82, 0.032, { x: Math.round(w * 0.05), w: Math.round(w * 0.75), align: "left", fill: "#ffd23f", fontWeight: 700, letterSpacing: 3 }),
        text(doc, church.toUpperCase(), 0.92, 0.02, { x: Math.round(w * 0.05), w: Math.round(w * 0.75), align: "left", fill: "#bbbbbb", letterSpacing: 4 }),
      ];
      return doc;
    },
  },
  {
    key: "thumb-worship",
    label: "Worship thumbnail",
    description: "YouTube: songs and worship nights",
    swatch: ["#3a0ca3", "#f72585"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#3a0ca3", color2: "#f72585", angle: 135 };
      doc.elements = [
        makeShape("ellipse", doc, { x: Math.round(w * 0.58), y: Math.round(h * 0.1), w: Math.round(h * 0.8), h: Math.round(h * 0.8), fill: "#ffffff", opacity: 0.14 }),
        text(doc, "WORSHIP", 0.1, 0.045, { x: Math.round(w * 0.06), w: Math.round(w * 0.7), align: "left", fill: "#ffd6e8", fontWeight: 700, letterSpacing: 10 }),
        text(doc, "Song Title", 0.26, 0.15, { x: Math.round(w * 0.06), w: Math.round(w * 0.8), align: "left", fill: "#ffffff", fontFamily: "script", lineHeight: 1.0 }),
        text(doc, "Live worship  ·  Lyrics in the description", 0.72, 0.03, { x: Math.round(w * 0.06), w: Math.round(w * 0.8), align: "left", fill: "#ffffff", fontWeight: 700 }),
        text(doc, church, 0.86, 0.026, { x: Math.round(w * 0.06), w: Math.round(w * 0.8), align: "left", fill: "#ffd6e8" }),
      ];
      return doc;
    },
  },
  {
    key: "thumb-verse",
    label: "Verse thumbnail",
    description: "YouTube: a short verse or devotion",
    swatch: ["#0f4c5c", "#fb8b24"],
    build: (w, h, church) => {
      const doc = emptyDoc(w, h);
      doc.background = { type: "gradient", color: "#0f4c5c", color2: "#062a33", angle: 160 };
      doc.elements = [
        makeShape("rect", doc, { x: 0, y: Math.round(h * 0.86), w, h: Math.round(h * 0.14), fill: "#fb8b24" }),
        text(doc, "VERSE OF THE DAY", 0.1, 0.03, { fill: "#fb8b24", fontWeight: 700, letterSpacing: 8 }),
        text(doc, "The Lord is my shepherd;\nI shall not want.", 0.26, 0.065, { x: Math.round(w * 0.1), w: Math.round(w * 0.8), fill: "#ffffff", fontFamily: "playfair", fontWeight: 700, lineHeight: 1.25 }),
        text(doc, "PSALM 23:1", 0.66, 0.035, { fill: "#fb8b24", fontWeight: 700, letterSpacing: 6 }),
        text(doc, church.toUpperCase(), 0.895, 0.022, { fill: "#062a33", fontWeight: 700, letterSpacing: 5 }),
      ];
      return doc;
    },
  },
];

export function getTemplate(key: string): DesignTemplate {
  return TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
}

/** Gives every element in a freshly built template its own id (templates reuse helpers that already do, but be sure). */
export function buildTemplate(key: string, width: number, height: number, churchName: string): DesignDoc {
  const doc = getTemplate(key).build(width, height, churchName || "Your church");
  doc.elements = doc.elements.map((e) => ({ ...e, id: newId() }));
  return doc;
}
