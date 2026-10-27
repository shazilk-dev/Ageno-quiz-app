/**
 * Light / Dark / System. The choice lives on this device only (localStorage); `<html data-theme>` carries
 * the resolved theme and every token in `app/theme.css` follows it. No Node or Firebase imports: the
 * inline script below runs before React and must stay tiny.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ageno:theme";
/** What a first visit gets (the server renders `<html data-theme="light">`). */
export const DEFAULT_PREFERENCE: ThemePreference = "light";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Fired on `window` after this tab changes the choice (the `storage` event covers the other tabs). */
export const THEME_CHANGE_EVENT = "ageno:theme-change";
/** Set on `<html>` for two frames around a change, so colours switch at once instead of smearing. */
export const THEME_SWITCHING_ATTR = "data-theme-switching";

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean
): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** The stored choice, or the default when nothing valid is stored or storage is unavailable. */
export function readPreference(
  storage?: Pick<Storage, "getItem"> | null
): ThemePreference {
  try {
    const store =
      storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : storage;
    const value = store?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

/** Returns false when the choice could not be kept (private window, blocked storage). */
export function writePreference(
  preference: ThemePreference,
  storage?: Pick<Storage, "setItem"> | null
): boolean {
  try {
    const store =
      storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : storage;
    if (!store) return false;
    store.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export function systemPrefersDark(): boolean {
  try {
    return (
      typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches
    );
  } catch {
    return false;
  }
}

/** Put a resolved theme on `<html>`. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement
) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Re-resolve the stored choice and apply it (used on load, on an OS change and when another tab changes it). */
export function syncTheme() {
  applyTheme(resolveTheme(readPreference(), systemPrefersDark()));
}

/** Save the choice, apply it with transitions off, and tell the rest of this tab. */
export function setPreference(preference: ThemePreference) {
  const root = document.documentElement;
  root.setAttribute(THEME_SWITCHING_ATTR, "");
  writePreference(preference);
  applyTheme(resolveTheme(preference, systemPrefersDark()), root);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => root.removeAttribute(THEME_SWITCHING_ATTR))
  );
}

/**
 * Runs in `<head>` before the first paint. A failure leaves the server's `data-theme="light"` alone.
 * Built from the same constants as above so the two cannot drift; covered by `__tests__/theme.test.ts`.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var d=p==="dark"||(p==="system"&&matchMedia(${JSON.stringify(
  DARK_QUERY
)}).matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
