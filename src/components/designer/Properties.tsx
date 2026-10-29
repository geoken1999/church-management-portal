"use client";

import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, Lock, LockOpen, Trash2 } from "lucide-react";
import { FONTS, type DesignBackground, type DesignDoc, type DesignElement, type FontKey } from "@/lib/designer/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ColorField, NumField, Section, Toggle } from "./fields";

type Patch = Partial<DesignElement>;

export function PageProperties({
  doc,
  name,
  onName,
  onBackground,
  readOnly,
}: {
  doc: DesignDoc;
  name: string;
  onName: (name: string) => void;
  onBackground: (bg: DesignBackground, key: string) => void;
  readOnly: boolean;
}) {
  const bg = doc.background;
  return (
    <div className="space-y-4">
      <Section title="Design">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => onName(e.target.value)} maxLength={80} disabled={readOnly} className="h-8" />
        </label>
        <p className="text-xs text-muted-foreground">
          {doc.width} × {doc.height} px
        </p>
      </Section>
      <Section title="Background">
        <div className="flex gap-1">
          <Toggle active={bg.type === "solid"} onClick={() => onBackground({ ...bg, type: "solid" }, "bg-type")} label="Solid">
            Solid
          </Toggle>
          <Toggle active={bg.type === "gradient"} onClick={() => onBackground({ ...bg, type: "gradient" }, "bg-type")} label="Gradient">
            Gradient
          </Toggle>
        </div>
        <ColorField label={bg.type === "gradient" ? "From" : "Colour"} value={bg.color} onChange={(color) => onBackground({ ...bg, color }, "bg-color")} />
        {bg.type === "gradient" && (
          <>
            <ColorField label="To" value={bg.color2} onChange={(color2) => onBackground({ ...bg, color2 }, "bg-color2")} />
            <NumField label="Angle" value={bg.angle ?? 160} min={0} max={360} onChange={(angle) => onBackground({ ...bg, angle }, "bg-angle")} />
          </>
        )}
      </Section>
      <p className="text-xs text-muted-foreground">Click something on the page to edit it. Arrow keys nudge, Delete removes, Ctrl+Z undoes.</p>
    </div>
  );
}

export function ElementProperties({
  el,
  onPatch,
  onLayer,
  onDuplicate,
  onDelete,
}: {
  el: DesignElement;
  onPatch: (patch: Patch, key: string) => void;
  onLayer: (move: "forward" | "backward" | "front" | "back") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const set = (key: keyof DesignElement) => (value: unknown) => onPatch({ [key]: value } as Patch, String(key));
  return (
    <div className="space-y-4">
      {el.type === "text" && (
        <Section title="Text">
          <Textarea id="design-text-input" value={el.text ?? ""} onChange={(e) => onPatch({ text: e.target.value }, "text")} rows={3} maxLength={2000} />
          <select
            value={el.fontFamily ?? "sans"}
            onChange={(e) => onPatch({ fontFamily: e.target.value as FontKey }, "fontFamily")}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            aria-label="Font"
          >
            {Object.entries(FONTS).map(([key, font]) => (
              <option key={key} value={key}>
                {font.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Size" value={el.fontSize ?? 32} min={4} max={600} onChange={set("fontSize")} />
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Weight</span>
              <select
                value={el.fontWeight ?? 400}
                onChange={(e) => onPatch({ fontWeight: Number(e.target.value) as 400 | 700 | 900 }, "fontWeight")}
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value={400}>Regular</option>
                <option value={700}>Bold</option>
                <option value={900}>Black</option>
              </select>
            </label>
            <NumField label="Line height" value={el.lineHeight ?? 1.2} min={0.6} max={3} step={0.1} onChange={set("lineHeight")} />
            <NumField label="Letter spacing" value={el.letterSpacing ?? 0} min={-10} max={60} onChange={set("letterSpacing")} />
          </div>
          <div className="flex flex-wrap gap-1">
            <Toggle active={el.align === "left"} onClick={() => onPatch({ align: "left" }, "align")} label="Align left">
              <AlignLeft className="size-4" />
            </Toggle>
            <Toggle active={(el.align ?? "center") === "center"} onClick={() => onPatch({ align: "center" }, "align")} label="Align centre">
              <AlignCenter className="size-4" />
            </Toggle>
            <Toggle active={el.align === "right"} onClick={() => onPatch({ align: "right" }, "align")} label="Align right">
              <AlignRight className="size-4" />
            </Toggle>
            <Toggle active={!!el.italic} onClick={() => onPatch({ italic: !el.italic }, "italic")} label="Italic">
              <span className="italic">I</span>
            </Toggle>
            <Toggle active={!!el.underline} onClick={() => onPatch({ underline: !el.underline }, "underline")} label="Underline">
              <span className="underline">U</span>
            </Toggle>
            <Toggle active={!!el.uppercase} onClick={() => onPatch({ uppercase: !el.uppercase }, "uppercase")} label="Capitals">
              AA
            </Toggle>
          </div>
          <ColorField label="Colour" value={el.fill} onChange={set("fill")} />
        </Section>
      )}

      {(el.type === "rect" || el.type === "ellipse" || el.type === "line") && (
        <Section title={el.type === "line" ? "Line" : "Shape"}>
          <ColorField label={el.type === "line" ? "Colour" : "Fill"} value={el.fill} onChange={set("fill")} allowNone={el.type !== "line"} />
          {el.type !== "line" && (
            <>
              <ColorField label="Border" value={el.stroke} onChange={set("stroke")} />
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Border width" value={el.strokeWidth ?? 0} min={0} max={100} onChange={set("strokeWidth")} />
                {el.type === "rect" && <NumField label="Corner radius" value={el.radius ?? 0} min={0} max={2000} onChange={set("radius")} />}
              </div>
            </>
          )}
        </Section>
      )}

      {el.type === "image" && (
        <Section title="Picture">
          <div className="flex gap-1">
            <Toggle active={(el.fit ?? "cover") === "cover"} onClick={() => onPatch({ fit: "cover" }, "fit")} label="Fill the box">
              Fill
            </Toggle>
            <Toggle active={el.fit === "contain"} onClick={() => onPatch({ fit: "contain" }, "fit")} label="Fit inside the box">
              Fit
            </Toggle>
          </div>
          <NumField label="Corner radius" value={el.radius ?? 0} min={0} max={2000} onChange={set("radius")} />
        </Section>
      )}

      <Section title="Position">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={el.x} onChange={set("x")} />
          <NumField label="Y" value={el.y} onChange={set("y")} />
          <NumField label="Width" value={el.w} min={1} onChange={set("w")} />
          {el.type !== "text" && <NumField label="Height" value={el.h} min={1} onChange={set("h")} />}
          <NumField label="Rotate °" value={el.rotation} min={-360} max={360} onChange={set("rotation")} />
          <NumField label="Opacity %" value={Math.round(el.opacity * 100)} min={0} max={100} onChange={(v) => onPatch({ opacity: Math.min(1, Math.max(0, v / 100)) }, "opacity")} />
        </div>
      </Section>

      <Section title="Arrange">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => onLayer("front")} aria-label="Bring to front" title="Bring to front">
            <ChevronsUp className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLayer("forward")} aria-label="Bring forward" title="Bring forward">
            <ArrowUp className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLayer("backward")} aria-label="Send backward" title="Send backward">
            <ArrowDown className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLayer("back")} aria-label="Send to back" title="Send to back">
            <ChevronsDown className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => onPatch({ locked: !el.locked }, "locked")}>
            {el.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} {el.locked ? "Unlock" : "Lock"}
          </Button>
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            <Copy className="size-4" /> Duplicate
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}
