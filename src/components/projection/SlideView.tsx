import type { CSSProperties } from "react";
import type { ProjectionSlide, ProjectionTheme } from "@/types/database";
import { fontScale, withDefaults } from "@/lib/projection/theme";

// One slide as it appears on the screen. Sizes are in container-width units (cqw), so the same view is the full-screen
// projector, the OBS overlay and the small preview in the console: it scales with whatever box it is placed in.
export function SlideView({
  slide,
  mode,
  theme,
  transparent = false,
}: {
  slide: ProjectionSlide | null;
  mode: "full" | "lower_third";
  theme: ProjectionTheme;
  /** No background of its own: for laying over video (OBS) */
  transparent?: boolean;
}) {
  const t = withDefaults(theme);
  const font = t.font === "serif" ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const root: CSSProperties = { containerType: "inline-size", width: "100%", height: "100%", fontFamily: font, color: t.color };

  if (!slide) return <div style={{ ...root, background: transparent || mode === "lower_third" ? "transparent" : t.background }} />;

  // A PowerPoint slide is a picture, and always fills the whole screen, whatever the mode: a lower-third bar has no
  // place for a song slide that was designed as a full page.
  if (slide.image) {
    return (
      <div style={{ ...root, background: transparent ? "transparent" : "#000", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={slide.image} src={slide.image} alt={slide.text} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", animation: "pv-fade 0.25s ease-out" }} />
      </div>
    );
  }

  const size = fontScale(slide.text.length, mode);
  const label = slide.kind === "bible" ? slide.title : slide.title;

  if (mode === "lower_third") {
    // A bar along the bottom, over the video.
    return (
      <div style={{ ...root, background: "transparent", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: `${t.background}e6`, padding: "1.6cqw 4cqw 1.8cqw", borderTop: `0.3cqw solid ${t.color}33`, animation: "pv-fade 0.35s ease-out" }}>
          <div style={{ fontSize: `${size}cqw`, lineHeight: 1.25, whiteSpace: "pre-line" }}>{slide.text}</div>
          <div style={{ marginTop: "0.8cqw", fontSize: "2cqw", opacity: 0.8, display: "flex", gap: "1.5cqw", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>{label}</span>
            <span>{slide.footer}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...root, background: transparent ? "transparent" : t.background, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5cqw 7cqw", textAlign: "center", boxSizing: "border-box" }}>
      <div key={slide.text + slide.title} style={{ animation: "pv-fade 0.35s ease-out", width: "100%" }}>
        <div style={{ fontSize: `${size}cqw`, lineHeight: 1.25, whiteSpace: "pre-line" }}>{slide.text}</div>
        <div style={{ marginTop: "3cqw", fontSize: "3cqw", fontWeight: 700, opacity: 0.9 }}>{label}</div>
        {slide.footer && <div style={{ marginTop: "0.6cqw", fontSize: "2.2cqw", opacity: 0.7 }}>{slide.footer}</div>}
      </div>
    </div>
  );
}
