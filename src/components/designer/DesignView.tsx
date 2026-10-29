import type { CSSProperties } from "react";
import { ICONS } from "@/lib/designer/icons";
import { FONTS, backgroundCss, type DesignDoc, type DesignElement } from "@/lib/designer/model";

// Draws a design as plain HTML at its natural pixel size. Callers scale it with CSS transform. The same markup is
// used by the editor, the gallery thumbnails and the PNG/PDF export, so what you see is what you download.

export function elementStyle(el: DesignElement): CSSProperties {
  return {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity,
    boxSizing: "border-box",
  };
}

export function ElementBody({ el }: { el: DesignElement }) {
  if (el.type === "text") {
    const style: CSSProperties = {
      width: "100%",
      color: el.fill,
      fontFamily: FONTS[el.fontFamily ?? "sans"].css,
      fontSize: el.fontSize,
      fontWeight: el.fontWeight ?? 400,
      fontStyle: el.italic ? "italic" : "normal",
      textDecoration: el.underline ? "underline" : "none",
      textAlign: el.align ?? "center",
      lineHeight: el.lineHeight ?? 1.2,
      letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
      textTransform: el.uppercase ? "uppercase" : "none",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    };
    // Text takes the height its words need (the box height only matters for selecting it), so nothing is clipped.
    return (
      <div data-text style={style}>
        {el.text}
      </div>
    );
  }
  if (el.type === "icon" && el.icon) {
    return (
      <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        <path d={ICONS[el.icon].path} fill={el.fill} fillRule="evenodd" />
      </svg>
    );
  }
  if (el.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={el.src}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        style={{ width: "100%", height: "100%", objectFit: el.fit ?? "cover", borderRadius: el.radius ?? 0, display: "block" }}
      />
    );
  }
  const border = el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : undefined;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: el.fill,
        border,
        borderRadius: el.type === "ellipse" ? "50%" : (el.radius ?? 0),
        boxSizing: "border-box",
      }}
    />
  );
}

export function DesignView({ doc, scale = 1 }: { doc: DesignDoc; scale?: number }) {
  return (
    <div style={{ width: doc.width * scale, height: doc.height * scale, overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: doc.width,
          height: doc.height,
          position: "absolute",
          left: 0,
          top: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: backgroundCss(doc.background),
          overflow: "hidden",
        }}
      >
        {doc.elements.map((el) => (
          <div key={el.id} style={elementStyle(el)}>
            <ElementBody el={el} />
          </div>
        ))}
      </div>
    </div>
  );
}
