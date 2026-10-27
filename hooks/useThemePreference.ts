"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCE,
  readPreference,
  setPreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored Light / Dark / System choice and a setter. The server render and hydration see the default. */
export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => void,
] {
  const preference = useSyncExternalStore(
    subscribe,
    () => readPreference(),
    () => DEFAULT_PREFERENCE
  );
  const set = useCallback((next: ThemePreference) => setPreference(next), []);
  return [preference, set];
}
