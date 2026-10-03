"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// Same Popover+icon-button pattern as LanguageSwitcher, placed next to it
// in the dashboard header. "system" is next-themes' own default (set via
// ThemeProvider), so a first-time visitor gets their OS's preference
// without picking anything. Loaded via ThemeToggleLoader (dynamic,
// ssr:false) rather than guarded by a "mounted" state flag here — the
// server has no way to know the visitor's OS theme, so this component
// only ever renders client-side in the first place, the same
// hydration-mismatch-avoidance pattern already used for EventsManager/
// InstagramManager elsewhere in this app.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label="Theme">
            <CurrentIcon className="size-4.5" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-44">
        <p className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">Theme</p>
        <div className="flex flex-col gap-0.5">
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3.5" />
                {label}
              </span>
              {value === theme && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
