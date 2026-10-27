"use client";

import { useEffect } from "react";
import {
  DARK_QUERY,
  readPreference,
  syncTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * Keeps `<html data-theme>` right after the first paint: follows the OS while the choice is System, and
 * follows another tab that changed it. Renders nothing; the inline script in `app/layout.tsx` does the first paint.
 */
export default function ThemeSync() {
  useEffect(() => {
    syncTheme();

    const media = window.matchMedia(DARK_QUERY);
    const onSystemChange = () => {
      if (readPreference() === "system") syncTheme();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) syncTheme();
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
