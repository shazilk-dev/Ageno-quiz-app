import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about the custom utilities defined in app/globals.css,
// otherwise `text-label` is mistaken for a text colour and merged away.
const twMerge = extendTailwindMerge<"text-label">({
  extend: {
    classGroups: {
      "text-label": ["text-label"],
    },
  },
});

/** Merge conditional class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Absolute URL of the Agenoverse site (override with NEXT_PUBLIC_AGENOVERSE_URL). */
export const AGENOVERSE_URL = (
  process.env.NEXT_PUBLIC_AGENOVERSE_URL || "https://agenoverse.org"
).replace(/\/$/, "");

/** Link to a page on the Agenoverse site. */
export function agenoverseUrl(path = "/"): string {
  return `${AGENOVERSE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
