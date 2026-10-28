"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRegionProps {
  /** Read by screen readers once the content is wider than its box ("Table, scrolls sideways"). */
  label: string;
  children: ReactNode;
}

/**
 * A box that scrolls sideways instead of widening the page. It only becomes a focusable, labelled region
 * when the content really overflows, so a small table adds no tab stop; a soft edge on the right says
 * there is more.
 */
export default function ScrollRegion({ label, children }: ScrollRegionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setScrollable(el.scrollWidth > el.clientWidth + 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="relative w-fit max-w-full">
      <div
        ref={ref}
        onScroll={measure}
        role={scrollable ? "region" : undefined}
        aria-label={scrollable ? label : undefined}
        tabIndex={scrollable ? 0 : undefined}
        className="overflow-x-auto rounded-md border border-control-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
      </div>
      {scrollable && !atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-px right-px w-5 rounded-r-md shadow-[inset_-10px_0_8px_-8px_var(--color-text-muted)]"
        />
      )}
    </div>
  );
}
