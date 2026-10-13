"use client";

import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { saveMenuPrefs, type MenuPrefs } from "@/lib/menu-prefs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Whether the menu's sections can be collapsed. On by default; this is where to turn it off (or back on).
export function MenuPreferences({ initial }: { initial: MenuPrefs }) {
  const [prefs, setPrefs] = useState<MenuPrefs>(initial);

  function setCollapsible(collapsible: boolean) {
    // Turning it off shows every section; turning it back on starts with them all open.
    const next = { collapsible, closed: [] };
    setPrefs(next);
    saveMenuPrefs(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PanelLeft className="size-4 text-primary" />
          Menu
        </CardTitle>
        <CardDescription>How the side menu behaves on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={prefs.collapsible} onChange={(e) => setCollapsible(e.target.checked)} />
          <span>
            Let me collapse and expand menu sections
            <span className="block text-xs text-muted-foreground">Tap a section&apos;s name to fold it away. When this is off, every section is always shown. The section you are on opens by itself.</span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
