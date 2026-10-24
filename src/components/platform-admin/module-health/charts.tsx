// Small charts drawn as plain SVG: no chart library to load, and they follow the site's colours (currentColor and
// the theme's CSS variables), so they look right in light and dark.

export function Sparkline({ values, className = "h-10 w-full", label }: { values: number[]; className?: string; label?: string }) {
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 30;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * (h - 3) - 1.5).toFixed(2)}`);
  const line = points.join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`text-primary ${className}`} role="img" aria-label={label ?? `Trend: ${values.join(", ")}`}>
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BarChart({ values, labels, height = 160, unit = "" }: { values: number[]; labels?: string[]; height?: number; unit?: string }) {
  const max = Math.max(1, ...values);
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <div className="flex gap-2" style={{ height }}>
      <div className="flex w-8 flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-muted-foreground">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="flex flex-1 items-end gap-1 border-b border-l border-border pb-0 pl-1" role="img" aria-label={`Bar chart: ${values.join(", ")}`}>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <div className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100 * 0.82)}%` }} />
            <span className="pointer-events-none absolute -top-5 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100">
              {v}
              {unit}
            </span>
            {labels?.[i] ? <span className="mt-1 h-4 text-[9px] leading-4 text-muted-foreground">{labels[i]}</span> : <span className="mt-1 h-4" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressBar({ percent, tone = "primary" }: { percent: number; tone?: "primary" | "good" | "warn" | "bad" }) {
  const color = { primary: "bg-primary", good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-destructive" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}
