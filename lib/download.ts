/** Saves text as a file from the browser. A byte order mark in `text` is kept (Excel needs it for UTF-8 CSV). */
export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A title as a file name: "Network basics!" -> "network-basics". */
export const fileSlug = (title: string, fallback = "quiz"): string =>
  title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
