"use client";

import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";

// "Send now" or "Send later": when it is later, a date and time in the church's own time zone.
export function SchedulePicker({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const later = value !== null;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={later}
          disabled={disabled}
          onChange={(e) => {
            if (!e.target.checked) return onChange(null);
            // Suggest the top of the next hour, which is enough notice.
            const d = new Date(Date.now() + 60 * 60_000);
            d.setMinutes(0, 0, 0);
            const pad = (n: number) => String(n).padStart(2, "0");
            onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
          }}
        />
        <CalendarClock className="size-4 text-muted-foreground" />
        Send later
      </label>
      {later && (
        <div className="space-y-1">
          <Input type="datetime-local" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className="max-w-xs" aria-label="Send at" />
          <p className="text-xs text-muted-foreground">This is your church&apos;s time (set in Church Profile). It goes out within 5 minutes of this time, and you can cancel it until then.</p>
        </div>
      )}
    </div>
  );
}
