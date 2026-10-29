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

  const versions = slide.kind === "bible" && slide.versions && slide.versions.length > 1 ? slide.versions : null;
  const longest = versions ? Math.max(...versions.map((v) => v.text.length)) : 0;
  const total = versions ? versions.reduce((sum, v) => sum + v.text.length, 0) : 0;
  // Two translations sit side by side (each column is about half as wide, so its letters are smaller); more are stacked.
  const sideBySide = !!versions && versions.length === 2 && mode === "full";
  const size = !versions ? fontScale(slide.text.length, mode) : sideBySide ? Math.max(1.9, fontScale(longest, "full") * 0.62) : mode === "full" ? Math.max(1.7, fontScale(total, "full") * 0.8) : fontScale(total, mode);
  const label = slide.title;

  if (mode === "lower_third") {
    // A bar along the bottom, over the video. A banner picture, when the church chose one, fills the bar behind the
    // words, under a wash of the screen colour so they stay readable.
    const wash = Math.round((t.bannerShade / 100) * 255).toString(16).padStart(2, "0");
    const bar: CSSProperties = t.bannerImage
      ? { background: `linear-gradient(${t.background}${wash}, ${t.background}${wash}), url("${t.bannerImage}") center / cover no-repeat` }
      : { background: `${t.background}e6` };
    return (
      <div style={{ ...root, background: "transparent", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, ...bar, padding: "1.6cqw 4cqw 1.8cqw", borderTop: `0.3cqw solid ${t.color}33`, animation: "pv-fade 0.35s ease-out" }}>
          {versions ? (
            <div style={{ fontSize: `${size}cqw`, lineHeight: 1.25, display: "grid", gap: "0.6cqw" }}>
              {versions.map((v) => (
                <div key={v.name}>
                  <span style={{ fontSize: "0.7em", fontWeight: 700, opacity: 0.7, marginRight: "0.8cqw" }}>{v.name}</span>
                  {v.text}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: `${size}cqw`, lineHeight: 1.25, whiteSpace: "pre-line" }}>{slide.text}</div>
          )}
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
        {versions ? (
          <div style={{ display: "grid", gridTemplateColumns: sideBySide ? "1fr 1fr" : "1fr", gap: sideBySide ? "4cqw" : "1.8cqw", fontSize: `${size}cqw`, lineHeight: 1.25, textAlign: sideBySide ? "left" : "center" }}>
            {versions.map((v) => (
              <div key={v.name}>
                <div style={{ fontSize: "0.55em", fontWeight: 700, letterSpacing: "0.08em", opacity: 0.6, marginBottom: "0.4em" }}>{v.name}</div>
                {v.text}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: `${size}cqw`, lineHeight: 1.25, whiteSpace: "pre-line" }}>{slide.text}</div>
        )}
        <div style={{ marginTop: "3cqw", fontSize: "3cqw", fontWeight: 700, opacity: 0.9 }}>{label}</div>
        {slide.footer && !versions && <div style={{ marginTop: "0.6cqw", fontSize: "2.2cqw", opacity: 0.7 }}>{slide.footer}</div>}
      </div>
    </div>
  );
}
