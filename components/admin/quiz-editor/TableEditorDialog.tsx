"use client";

import { Minus, Plus } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Button, Dialog } from "@/components/ui";
import { blankTable, editableCell, escapeCell, storableCell, tableToMarkdown } from "@/lib/rich-text/build";
import { cellsFromText, MAX_PASTE_CELLS, tableFromClipboard } from "@/lib/rich-text/paste";
import type { Align } from "@/lib/rich-text/types";
import { cn } from "@/lib/utils";

/** Adding stops here (a table already bigger than this can keep what it has). Wider reads badly on a phone. */
export const MAX_COLUMNS = 8;
export const MAX_BODY_ROWS = 20;

interface TableEditorDialogProps {
  /** `"insert"` starts from a blank table; `"edit"` opens the table under the cursor. */
  mode: "insert" | "edit";
  /** Cell source, header row first (for `"edit"`). */
  cells?: string[][];
  align?: Align[];
  onClose: () => void;
  /** The finished table as Markdown. */
  onConfirm: (markdown: string) => void;
}

const ALIGN_CHOICES: { value: string; label: string }[] = [
  { value: "none", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right (numbers)" },
];

const inputClasses =
  "h-10 w-full min-w-28 rounded-md border border-control-border bg-surface px-2 text-sm text-text transition-fast hover:border-text-muted focus-visible:border-accent";

/**
 * The cells of a table as a small grid: type in them, add or remove rows and columns, set how a column is
 * aligned, or paste a block of cells from a spreadsheet. Inserts a new table or rewrites the one under the cursor.
 */
export function TableEditorDialog({ mode, cells, align, onClose, onConfirm }: TableEditorDialogProps) {
  const [grid, setGrid] = useState<string[][]>(() =>
    (cells ?? blankTable(3, 2)).map((row) => row.map(editableCell))
  );
  const [aligns, setAligns] = useState<Align[]>(() => align ?? []);
  const tableRef = useRef<HTMLTableElement>(null);

  const columns = grid[0].length;
  const bodyRows = grid.length - 1;
  const canAddColumn = columns < Math.max(MAX_COLUMNS, cells?.[0]?.length ?? 0);
  const canAddRow = bodyRows < Math.max(MAX_BODY_ROWS, (cells?.length ?? 1) - 1);

  const setCell = (row: number, column: number, value: string) =>
    setGrid((current) => current.map((r, i) => (i === row ? r.map((c, j) => (j === column ? value : c)) : r)));

  const addColumn = () => setGrid((current) => current.map((row, i) => [...row, i === 0 ? `Column ${row.length + 1}` : ""]));
  const removeColumn = (column: number) => {
    setGrid((current) => current.map((row) => row.filter((_, j) => j !== column)));
    setAligns((current) => current.filter((_, j) => j !== column));
  };
  const addRow = () => setGrid((current) => [...current, Array.from({ length: columns }, () => "")]);
  const removeRow = (row: number) => setGrid((current) => current.filter((_, i) => i !== row));

  const focusCell = (row: number, column: number) =>
    tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${column}"]`)?.focus();

  /** Enter goes to the cell below, like a spreadsheet; it must not reach the quiz form. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    focusCell(Math.min(row + 1, grid.length - 1), column);
  };

  /** A block of cells (from Excel, Sheets or Word) fills the grid from the cell it was pasted into. */
  const onPaste = (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    const rows =
      tableFromClipboard({
        html: event.clipboardData.getData("text/html"),
        text: event.clipboardData.getData("text/plain"),
      }) ?? cellsFromText(event.clipboardData.getData("text/plain"));
    if (!rows || (rows.length === 1 && rows[0].length === 1)) return;
    event.preventDefault();
    const width = Math.max(...rows.map((r) => r.length));
    if ((row + rows.length) * (column + width) > MAX_PASTE_CELLS) return;
    setGrid((current) => {
      const nextColumns = Math.max(current[0].length, column + width);
      const next = current.map((r) => [...r, ...Array.from({ length: nextColumns - r.length }, () => "")]);
      rows.forEach((values, dr) => {
        while (next.length <= row + dr) next.push(Array.from({ length: nextColumns }, () => ""));
        values.forEach((value, dc) => {
          next[row + dr][column + dc] = editableCell(escapeCell(value));
        });
      });
      return next;
    });
  };

  const confirm = () => onConfirm(tableToMarkdown(grid.map((row) => row.map(storableCell)), aligns));

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "insert" ? "Insert a table" : "Edit table"}
      description="The first row is the header. Leave it empty for a table without headings. You can paste cells from a spreadsheet."
      className="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm}>{mode === "insert" ? "Insert table" : "Update table"}</Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table ref={tableRef} className="border-collapse">
          <caption className="sr-only">Table cells. Row 1 is the header.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-11 p-0" />
              {grid[0].map((_, column) => (
                <th key={column} scope="col" className="p-1 text-left align-bottom font-normal">
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={`Alignment of column ${column + 1}`}
                      value={aligns[column] ?? "none"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAligns((current) => {
                          const next = Array.from({ length: columns }, (_, j) => current[j] ?? null);
                          next[column] = value === "none" ? null : (value as Align);
                          return next;
                        });
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-control-border bg-surface px-1 text-xs text-text-muted"
                    >
                      {ALIGN_CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeColumn(column)}
                      disabled={columns <= 1}
                      aria-label={`Remove column ${column + 1}`}
                      title={`Remove column ${column + 1}`}
                      className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-error disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <th scope="row" className="w-11 p-0 pr-1 text-right align-middle">
                  {r > 0 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(r)}
                      disabled={bodyRows <= 1}
                      aria-label={`Remove row ${r + 1}`}
                      title={`Remove row ${r + 1}`}
                      className="grid size-8 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-error disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="pr-1 font-mono text-xs text-text-muted">Head</span>
                  )}
                </th>
                {row.map((value, column) => (
                  <td key={column} className="p-1">
                    <input
                      type="text"
                      data-cell={`${r}-${column}`}
                      value={value}
                      aria-label={r === 0 ? `Header, column ${column + 1}` : `Row ${r + 1}, column ${column + 1}`}
                      onChange={(event) => setCell(r, column, event.target.value)}
                      onKeyDown={(event) => onKeyDown(event, r, column)}
                      onPaste={(event) => onPaste(event, r, column)}
                      className={cn(inputClasses, r === 0 && "font-medium")}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={addRow} disabled={!canAddRow}>
          <Plus className="size-4" aria-hidden="true" />
          Add row
        </Button>
        <Button variant="secondary" size="sm" onClick={addColumn} disabled={!canAddColumn}>
          <Plus className="size-4" aria-hidden="true" />
          Add column
        </Button>
        <p className="text-sm text-text-muted">
          {columns} {columns === 1 ? "column" : "columns"}, {bodyRows} {bodyRows === 1 ? "row" : "rows"} below the header.
          Up to {MAX_COLUMNS} columns read well on a phone.
        </p>
      </div>
    </Dialog>
  );
}
