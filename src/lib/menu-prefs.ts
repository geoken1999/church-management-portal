// How the sidebar menu is set up for one person: whether its sections can be collapsed, and which
// ones they have collapsed. Kept in a cookie so the server draws the menu the way it was left,
// with no flash of every section opening and then closing.
export const MENU_COOKIE = "kf_menu";
export const MENU_PREFS_EVENT = "kf-menu-prefs-changed";

export interface MenuPrefs {
  // Sections can be collapsed and expanded. On unless the person turns it off.
  collapsible: boolean;
  // Keys of the sections currently collapsed.
  closed: string[];
}

export const DEFAULT_MENU_PREFS: MenuPrefs = { collapsible: true, closed: [] };

export function parseMenuPrefs(raw: string | undefined | null): MenuPrefs {
  if (!raw) return DEFAULT_MENU_PREFS;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<MenuPrefs>;
    return {
      collapsible: value.collapsible !== false,
      closed: Array.isArray(value.closed) ? value.closed.filter((k): k is string => typeof k === "string").slice(0, 30) : [],
    };
  } catch {
    return DEFAULT_MENU_PREFS;
  }
}

export function serializeMenuPrefs(prefs: MenuPrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

// Browser only: stores the prefs for a year and tells the open menu to update.
export function saveMenuPrefs(prefs: MenuPrefs): void {
  document.cookie = `${MENU_COOKIE}=${serializeMenuPrefs(prefs)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(MENU_PREFS_EVENT));
}

export function readMenuPrefsFromBrowser(): MenuPrefs {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${MENU_COOKIE}=`));
  return parseMenuPrefs(match ? match.slice(MENU_COOKIE.length + 1) : null);
}
