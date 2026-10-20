"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

// A one-time code shown as separate boxes. One real input sits invisibly over the boxes, so typing,
// pasting and the browser's "fill from SMS" all work as with a plain field.
export function CodeBoxes({
  value,
  onChange,
  length = 6,
  id,
  autoFocus = true,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, length - 1);
  return (
    <div
      className="relative mx-auto flex w-fit gap-2"
      onClick={() => input.current?.focus()}
    >
      {Array.from({ length }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "flex size-11 items-center justify-center rounded-md border border-input bg-background text-lg font-semibold",
            i === active &&
              !disabled &&
              "border-primary ring-2 ring-primary/30",
          )}
        >
          {value[i] ?? ""}
        </div>
      ))}
      <input
        ref={input}
        id={id}
        aria-label="Code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, length))
        }
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
      />
    </div>
  );
}
