"use client";

import { lazy, Suspense, useMemo } from "react";
import { parseRichText } from "@/lib/rich-text/parse";
import type { Block } from "@/lib/rich-text/types";
import { cn } from "@/lib/utils";
import { renderInline } from "./Inlines";

// Tables and code blocks load on their own: most questions have neither, and pages that show question text
// (the result page) stay inside their size budget.
const RichTable = lazy(() => import("./RichTable"));
const RichCode = lazy(() => import("./RichCode"));

/** Holds the place of a table or code block while its code loads, so the page does not jump much. */
const Pending = <div aria-hidden="true" className="h-20 w-full max-w-[68ch] rounded-md border border-border bg-surface" />;

interface RichTextProps {
  text: string;
  /** `"blocks"`: paragraphs, tables, lists, code blocks (question text, explanation). `"inline"`: bold, italic, code and line breaks only, in a `span` (option text, reasons). */
  mode?: "blocks" | "inline";
  /** Sets the type of the paragraphs; tables, lists and code blocks use their own smaller, regular type. */
  className?: string;
}

const LIST = "max-w-[68ch] space-y-1 pl-6 font-normal text-base text-text-body";

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={index} className="max-w-[68ch]">
          {renderInline(block.children)}
        </p>
      );
    case "table":
      return (
        <Suspense key={index} fallback={Pending}>
          <RichTable block={block} />
        </Suspense>
      );
    case "list": {
      const items = block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
      return block.ordered ? (
        <ol key={index} start={block.start === 1 ? undefined : block.start} className={cn(LIST, "list-decimal")}>
          {items}
        </ol>
      ) : (
        <ul key={index} className={cn(LIST, "list-disc")}>
          {items}
        </ul>
      );
    }
    case "code":
      return (
        <Suspense key={index} fallback={Pending}>
          <RichCode text={block.text} />
        </Suspense>
      );
  }
}

/**
 * Question text with its structure: the Markdown subset in docs/RICH_TEXT_PLAN.md. Plain text (no marks,
 * no table) renders as paragraphs and line breaks, as before. If the parser ever fails the text shows as
 * typed, so a broken question never blanks the exam.
 */
export default function RichText({ text, mode = "blocks", className }: RichTextProps) {
  const blocks = useMemo(() => {
    try {
      return parseRichText(text, { blocks: mode === "inline" ? "inline" : "all" }).blocks;
    } catch {
      return null;
    }
  }, [text, mode]);

  if (blocks === null) {
    return mode === "inline" ? (
      <span className={cn("whitespace-pre-line", className)}>{text}</span>
    ) : (
      <div className={cn("whitespace-pre-line", className)}>{text}</div>
    );
  }
  if (mode === "inline") {
    const first = blocks[0];
    return <span className={className}>{first?.type === "paragraph" ? renderInline(first.children) : null}</span>;
  }
  return <div className={cn("space-y-3", className)}>{blocks.map(renderBlock)}</div>;
}
