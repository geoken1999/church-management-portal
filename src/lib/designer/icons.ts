// Shapes and symbols for the designer. Every path is drawn in a 24 × 24 box and filled with one colour, so they stay
// sharp at any size. Pure data (no React), so the server can check a saved design against the same list.

export interface IconDef {
  label: string;
  group: "shapes" | "church" | "info";
  path: string;
}

function burst(points: number, outer: number, inner: number): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${coords.join("L")}Z`;
}

export const ICONS = {
  triangle: { label: "Triangle", group: "shapes", path: "M12 2 22 21H2z" },
  diamond: { label: "Diamond", group: "shapes", path: "M12 1 23 12 12 23 1 12z" },
  hexagon: { label: "Hexagon", group: "shapes", path: "M12 1.5 21 6.75v10.5L12 22.5 3 17.25V6.75z" },
  star: { label: "Star", group: "shapes", path: "M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.1L12 17.6 5.7 21.3l1.7-7.1L2 9.5l7.1-.6z" },
  burst: { label: "Burst", group: "shapes", path: burst(12, 11.5, 8.5) },
  badge: { label: "Badge", group: "shapes", path: burst(24, 11.5, 10) },
  ring: { label: "Ring", group: "shapes", path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z" },
  arrow: { label: "Arrow", group: "shapes", path: "M3 9.5h11V4.5l8 7.5-8 7.5v-5H3z" },
  ribbon: { label: "Ribbon", group: "shapes", path: "M2 5h20l-4.5 7L22 19H2z" },
  bubble: { label: "Speech bubble", group: "shapes", path: "M3 3h18v14H10l-5 4v-4H3z" },
  heart: { label: "Heart", group: "church", path: "M12 21.5s-9-5.6-9-12A5 5 0 0 1 12 6.8 5 5 0 0 1 21 9.5c0 6.4-9 12-9 12z" },
  cross: { label: "Cross", group: "church", path: "M10 1h4v7h7v4h-7v11h-4V12H3V8h7z" },
  flame: { label: "Flame", group: "church", path: "M12 1.5c.8 4.2 5.5 6.2 5.5 11.5a5.5 5.5 0 0 1-11 0c0-2.2.9-3.6 2.2-4.8.1 1.9.9 3 2 3.3C10.1 8.7 10.6 5.3 12 1.5z" },
  crown: { label: "Crown", group: "church", path: "M2.5 19h19v2.5h-19zM2 7l5.2 4.4L12 3.5l4.8 7.9L22 7l-2.2 10.5H4.2z" },
  book: { label: "Bible", group: "church", path: "M4 2.5h13.5A2.5 2.5 0 0 1 20 5v16.5H7A3 3 0 0 1 4 18.5zm3 2.5v11.4q.5-.3 1.2-.4H17.5V5z" },
  music: { label: "Music note", group: "church", path: "M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h8V3z" },
  sun: { label: "Sun", group: "church", path: "M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM11 .5h2v3.5h-2zm0 20h2V24h-2zM.5 11H4v2H.5zm20 0H24v2h-3.5zM3.7 5.1l1.4-1.4 2.5 2.5-1.4 1.4zm12.7 12.7 1.4-1.4 2.5 2.5-1.4 1.4zM5.1 20.3 3.7 18.9l2.5-2.5 1.4 1.4zM17.8 7.6l-1.4-1.4 2.5-2.5 1.4 1.4z" },
  pin: { label: "Location", group: "info", path: "M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 5.3 7.5 13.5 7.5 13.5S19.5 14.300 19.500 9A7.500 7.500 0 0 0 12 1.500zm0 10.500a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" },
  clock: { label: "Clock", group: "info", path: "M12 1.500a10.500 10.500 0 1 0 0 21 10.500 10.500 0 0 0 0-21zM11 6h2v5.600l4 2.300-1 1.700-5-3z" },
  calendar: { label: "Calendar", group: "info", path: "M7 1.500h2v2h6v-2h2v2h3.500v19h-19v-19H7zM5.500 9v11h13V9z" },
  phone: { label: "Phone", group: "info", path: "M6.600 10.800a15 15 0 0 0 6.600 6.600l2.200-2.200a1 1 0 0 1 1-.25 11 11 0 0 0 3.600.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.500a1 1 0 0 1 1 1c0 1.250.2 2.450.57 3.570a1 1 0 0 1-.25 1z" },
  mail: { label: "Email", group: "info", path: "M2 4.500h20v15H2zM4 7v.6l8 5.400 8-5.400V7zm0 3.200V17h16v-6.800l-8 5.400z" },
  check: { label: "Tick", group: "info", path: "M9 16.200 4.800 12l-1.800 1.800L9 19.800 21 7.800 19.200 6z" },
} as const satisfies Record<string, IconDef>;

export type IconKey = keyof typeof ICONS;
export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

export function isIconKey(value: unknown): value is IconKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ICONS, value);
}
