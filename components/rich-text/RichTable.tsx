"use client";

import type { Align, Block } from "@/lib/rich-text/types";
import { cn } from "@/lib/utils";
import { renderInline } from "./Inlines";
import ScrollRegion from "./ScrollRegion";

type TableBlock = Extract<Block, { type: "table" }>;

const ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right tabular-nums",
};

const cellClass = (align: Align) => cn("px-3 py-1.5 align-top", ALIGN[align ?? "left"]);

/**
 * A real `<table>` (header cells are `th scope="col"`) inside a box that scrolls sideways on a small screen.
 * Markdown needs a header row, so a table whose header cells are all empty is shown without one.
 */
export default function RichTable({ block }: { block: TableBlock }) {
  const headed = block.header.some((cell) => cell.length > 0);
  return (
    <ScrollRegion label="Table, scrolls sideways">
      <table className="border-collapse font-normal text-sm text-text-body lg:text-base">
        {headed && (
          <thead className="bg-surface text-text">
            <tr>
              {block.header.map((cell, column) => (
                <th key={column} scope="col" className={cn(cellClass(block.align[column]), "font-medium")}>
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index} className={cn(headed || index > 0 ? "border-t border-border" : "")}>
              {row.map((cell, column) => (
                <td key={column} className={cellClass(block.align[column])}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
