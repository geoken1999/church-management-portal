"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const PALETTE = ["#111111", "#ffffff", "#F5C518", "#e63946", "#ff7f11", "#2a9d8f", "#1d3557", "#8338ec", "#0b3d2e", "#f6efe3"];

export function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(next)) onChange(next);
        }}
        className="h-8"
      />
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  allowNone?: boolean;
}) {
  const current = value ?? "#000000";
  const none = current.length === 9 && current.endsWith("00");
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-1">
        <input
          type="color"
          value={current.slice(0, 7).length === 7 ? current.slice(0, 7) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border bg-transparent p-0"
          aria-label={`${label} colour`}
        />
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`size-5 rounded-full border ${current.toLowerCase() === c.toLowerCase() ? "ring-2 ring-primary ring-offset-1" : ""}`}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange("#00000000")}
            className={`h-5 rounded-full border px-2 text-[10px] ${none ? "bg-muted font-semibold" : ""}`}
          >
            None
          </button>
        )}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b pb-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function Toggle({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
