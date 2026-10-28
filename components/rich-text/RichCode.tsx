"use client";

import ScrollRegion from "./ScrollRegion";

/** A code block: monospace, as typed, scrolling sideways instead of widening the page. */
export default function RichCode({ text }: { text: string }) {
  return (
    <ScrollRegion label="Code, scrolls sideways">
      <pre className="bg-surface px-3 py-2 font-mono font-normal text-sm text-text-body">{text}</pre>
    </ScrollRegion>
  );
}
