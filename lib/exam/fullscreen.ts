/**
 * Thin wrapper over the Fullscreen API, including Safari's prefixed version. Everything is safe to call
 * on the server and in browsers without support (iPhone Safari offers fullscreen for video only).
 */
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
] as const;

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Fills the whole screen with the page. Must be called from a click or key press. Resolves false if
 * the browser refuses or has no fullscreen, never throws.
 */
export async function enterFullscreen(): Promise<boolean> {
  if (!isFullscreenSupported()) return false;
  if (isFullscreen()) return true;
  try {
    const element = document.documentElement as FullscreenElement;
    if (element.requestFullscreen) await element.requestFullscreen();
    else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    }
  } catch {
    return false;
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const doc = document as FullscreenDocument;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // Already out, or the browser won't let us: nothing to do.
  }
}
