"use client";

import { useEffect, useRef, useState } from "react";
import {
  enterFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  isFullscreen,
} from "@/lib/exam/fullscreen";

/**
 * Whether the page is fullscreen right now, and a callback for the moment it stops being fullscreen
 * (Esc, F11, the browser's own controls). `enter` must be called from a click.
 */
export function useFullscreen(onExit?: () => void) {
  const [active, setActive] = useState(() => isFullscreen());

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    let wasFullscreen = isFullscreen();
    const onChange = () => {
      const now = isFullscreen();
      setActive(now);
      if (wasFullscreen && !now) onExitRef.current?.();
      wasFullscreen = now;
    };
    for (const name of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(name, onChange);
    }
    onChange();
    return () => {
      for (const name of FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(name, onChange);
      }
    };
  }, []);

  return { active, enter: enterFullscreen };
}
