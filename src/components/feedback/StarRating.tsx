"use client";

import { Star } from "lucide-react";

export function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          onClick={() => onChange(n)}
          className="rounded p-0.5 text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={`size-8 ${n <= value ? "fill-current" : ""}`} />
        </button>
      ))}
    </div>
  );
}
