import type { Block, Inline } from "./types";

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "break":
          return " ";
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}

function blockText(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return inlineText(block.children);
    case "code":
      return block.text;
    case "list":
      return block.items.map(inlineText).join("; ");
    case "table":
      return [block.header, ...block.rows].map((row) => row.map(inlineText).join(", ")).join("; ");
  }
}

/** One line of text for tooltips, list previews and screen-reader fallbacks. */
export function toPlainText(blocks: Block[]): string {
  return blocks.map(blockText).join(" ").replace(/\s+/g, " ").trim();
}

/** True when the text holds a table, a list or a code block (not just paragraphs and inline marks). */
export function hasStructure(blocks: Block[]): boolean {
  return blocks.some((block) => block.type !== "paragraph");
}

/** Which structures the text holds, once each, in the order they first appear (`"table"`, `"list"`, `"code"`). */
export function structureOf(blocks: Block[]): Array<"table" | "list" | "code"> {
  const found: Array<"table" | "list" | "code"> = [];
  for (const block of blocks) {
    if (block.type !== "paragraph" && !found.includes(block.type)) found.push(block.type);
  }
  return found;
}

/** The first non-empty line of raw text, trimmed: what a one-line cell shows for a multi-line question. */
export function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}
