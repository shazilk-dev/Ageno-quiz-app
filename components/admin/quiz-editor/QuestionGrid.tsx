"use client";

import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { type ClipboardEvent, type Dispatch, type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { LIMITS, type Level, type QuestionType } from "@/lib/quiz-schema";
import { cn } from "@/lib/utils";
import { newKey, type DraftQuestion, type EditorAction } from "./editor-state";
import { correctLetters, isBlockOfCells, pasteIntoGrid, setCorrectFromText } from "./grid";

const letter = (index: number) => String.fromCharCode(65 + index);

const cellClasses =
  "h-9 w-full rounded-sm border border-transparent bg-transparent px-2 text-sm text-text transition-fast placeholder:text-text-muted/50 hover:border-border focus-visible:border-accent focus-visible:bg-bg-alt";

interface QuestionGridProps {
  level: Level;
  questions: DraftQuestion[];
  selected: ReadonlySet<string>;
  onSelect: (key: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  /** The first problem of each question from the last failed save, by index. */
  problems: ReadonlyMap<number, string>;
  dispatch: Dispatch<EditorAction>;
  /** Several questions changed at once (a paste); the section keeps the "undo" for it. */
  onReplace: (questions: DraftQuestion[], message: string) => void;
  onOpenCard: (index: number) => void;
  onPreview: (index: number) => void;
}

/**
 * A level as a table, one row per question: question, options A to D (or more), the correct answer and the
 * type. Built for fixing many things fast. Arrow keys move between cells (Left and Right once the caret
 * reaches the edge of the text), Enter goes down a row and adds one at the end, and a block of cells copied
 * from a spreadsheet is pasted over the rows from the cell you're in, adding rows as needed.
 */
export function QuestionGrid({
  level,
  questions,
  selected,
  onSelect,
  onSelectAll,
  problems,
  dispatch,
  onReplace,
  onOpenCard,
  onPreview,
}: QuestionGridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [extra, setExtra] = useState(0);
  const [focusAt, setFocusAt] = useState<{ row: number; col: number } | null>(null);

  const widest = questions.reduce((most, question) => Math.max(most, question.options.length), 0);
  const optionColumns = Math.min(LIMITS.maxOptions, Math.max(4, widest, extra));
  const correctColumn = optionColumns + 1;
  const allSelected = questions.length > 0 && questions.every((question) => selected.has(question.key));

  // Move focus to a cell once it exists (a row that was just added, say).
  useEffect(() => {
    if (!focusAt) return;
    const cell = tableRef.current?.querySelector<HTMLInputElement>(
      `[data-row="${focusAt.row}"][data-col="${focusAt.col}"]`
    );
    if (cell) {
      cell.focus();
      cell.select();
      setFocusAt(null);
    }
  }, [focusAt, questions.length]);

  const move = (row: number, col: number) => {
    if (row < 0 || col < 0 || col > correctColumn) return;
    if (row >= questions.length) {
      if (questions.length >= LIMITS.maxQuestionsPerLevel) return;
      dispatch({ type: "addQuestion", level, key: newKey() });
    }
    setFocusAt({ row, col });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col) || event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(row + 1 > questions.length - 1 ? row : row + 1, col);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(Math.max(row - 1, 0), col);
        break;
      case "Enter":
        // Enter must not submit the editor's form from here.
        event.preventDefault();
        move(event.shiftKey ? Math.max(row - 1, 0) : row + 1, col);
        break;
      case "ArrowRight":
        if (target.selectionStart === target.value.length && target.selectionEnd === target.value.length) {
          event.preventDefault();
          move(row, Math.min(col + 1, correctColumn));
        }
        break;
      case "ArrowLeft":
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          event.preventDefault();
          move(row, Math.max(col - 1, 0));
        }
        break;
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTableElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
    const text = event.clipboardData.getData("text");
    if (!isBlockOfCells(text)) return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    event.preventDefault();

    const result = pasteIntoGrid(questions, optionColumns, { row, column: col }, text, newKey);
    if (result.applied === 0 && result.ignored === 0) return;
    const capped = result.questions.slice(0, LIMITS.maxQuestionsPerLevel);
    setExtra(result.optionColumns);
    const rows = capped.length - questions.length;
    onReplace(
      capped,
      [
        `Pasted ${result.applied} cell${result.applied === 1 ? "" : "s"}`,
        rows > 0 ? `added ${rows} row${rows === 1 ? "" : "s"}` : null,
        result.usedHeader ? "matched the columns by their headings" : null,
        result.ignored > 0 ? `${result.ignored} didn't fit and ${result.ignored === 1 ? "was" : "were"} left out` : null,
        result.questions.length > capped.length
          ? `rows past ${LIMITS.maxQuestionsPerLevel} were left out`
          : null,
      ]
        .filter(Boolean)
        .join("; ") + "."
    );
  };

  const toggleRow = useCallback((key: string, on: boolean) => onSelect(key, on), [onSelect]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table ref={tableRef} onKeyDown={onKeyDown} onPaste={onPaste} className="w-full min-w-[48rem] border-collapse text-left">
          <caption className="sr-only">
            Questions as a table. Arrow keys move between cells, Enter goes down a row, and you can paste rows
            copied from a spreadsheet.
          </caption>
          <thead>
            <tr className="border-b border-border font-mono text-xs uppercase tracking-[0.05em] text-text-muted">
              <th scope="col" className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onSelectAll(event.target.checked)}
                  aria-label="Select every question in this level"
                  className="size-4 accent-[var(--color-teal)]"
                />
              </th>
              <th scope="col" className="w-10 px-1 py-2 font-normal">
                #
              </th>
              <th scope="col" className="min-w-64 px-2 py-2 font-normal">
                Question
              </th>
              {Array.from({ length: optionColumns }, (_, i) => (
                <th key={i} scope="col" className="min-w-36 px-2 py-2 font-normal">
                  {letter(i)}
                </th>
              ))}
              <th scope="col" className="w-28 px-2 py-2 font-normal">
                Correct
              </th>
              <th scope="col" className="w-32 px-2 py-2 font-normal">
                Type
              </th>
              <th scope="col" className="w-28 px-2 py-2 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question, index) => (
              <GridRow
                key={question.key}
                level={level}
                question={question}
                index={index}
                optionColumns={optionColumns}
                selected={selected.has(question.key)}
                problem={problems.get(index)}
                dispatch={dispatch}
                onSelect={toggleRow}
                onOpenCard={onOpenCard}
                onPreview={onPreview}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={questions.length >= LIMITS.maxQuestionsPerLevel}
          onClick={() => move(questions.length, 0)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a row
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={optionColumns >= LIMITS.maxOptions}
          onClick={() => setExtra(optionColumns + 1)}
        >
          Add option column {optionColumns < LIMITS.maxOptions ? letter(optionColumns) : ""}
        </Button>
      </div>
      <p className="max-w-[70ch] text-sm text-text-muted">
        Up and Down move between rows, Left and Right at the edge of a cell move across, Enter goes down (and
        adds a row at the end). In the Correct column type a letter such as B, or A, C for a select-all
        question. Copy cells from a spreadsheet and paste them here to fill many rows at once.
      </p>
    </div>
  );
}

interface GridRowProps {
  level: Level;
  question: DraftQuestion;
  index: number;
  optionColumns: number;
  selected: boolean;
  problem?: string;
  dispatch: Dispatch<EditorAction>;
  onSelect: (key: string, on: boolean) => void;
  onOpenCard: (index: number) => void;
  onPreview: (index: number) => void;
}

const GridRow = memo(function GridRow({
  level,
  question,
  index,
  optionColumns,
  selected,
  problem,
  dispatch,
  onSelect,
  onOpenCard,
  onPreview,
}: GridRowProps) {
  const { key } = question;
  const number = index + 1;

  return (
    <tr id={`question-${key}`} className={cn("border-b border-border last:border-b-0", selected && "bg-accent/5")}>
      <td className="px-2 py-1 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(key, event.target.checked)}
          aria-label={`Select question ${number}`}
          className="mt-2.5 size-4 accent-[var(--color-teal)]"
        />
      </td>
      <th scope="row" className={cn("px-1 py-1 text-left align-top font-mono text-xs font-normal", problem ? "text-error" : "text-text-muted")}>
        <span className="mt-2.5 block">{number}</span>
      </th>
      <td className="px-1 py-1 align-top">
        <input
          type="text"
          data-row={index}
          data-col={0}
          value={question.text}
          onChange={(event) => dispatch({ type: "gridCell", level, key, column: 0, value: event.target.value })}
          aria-label={`Question ${number}`}
          aria-invalid={problem ? true : undefined}
          title={question.text}
          className={cn(cellClasses, problem && "border-error")}
        />
        {problem && <p className="px-2 pb-1 text-xs text-error">{problem}</p>}
      </td>
      {Array.from({ length: optionColumns }, (_, i) => {
        const option = question.options[i];
        return (
          <td key={i} className="px-1 py-1 align-top">
            <input
              type="text"
              data-row={index}
              data-col={i + 1}
              value={option?.text ?? ""}
              onChange={(event) =>
                dispatch({ type: "gridCell", level, key, column: i + 1, value: event.target.value })
              }
              aria-label={`Question ${number}, option ${letter(i)}${option?.isCorrect ? ", correct" : ""}`}
              title={option?.text}
              placeholder={option ? undefined : "–"}
              className={cn(cellClasses, option?.isCorrect && "border-accent/60 bg-accent/10")}
            />
          </td>
        );
      })}
      <td className="px-1 py-1 align-top">
        <CorrectCell level={level} question={question} index={index} column={optionColumns + 1} dispatch={dispatch} />
      </td>
      <td className="px-1 py-1 align-top">
        <select
          value={question.type}
          onChange={(event) =>
            dispatch({ type: "setType", level, key, questionType: event.target.value as QuestionType })
          }
          aria-label={`Type of question ${number}`}
          className="h-9 w-full rounded-sm border border-transparent bg-transparent px-1 text-sm text-text transition-fast hover:border-border focus-visible:border-accent"
        >
          <option value="single">One answer</option>
          <option value="multiple">Select all</option>
        </select>
      </td>
      <td className="px-1 py-1 align-top">
        <div className="flex">
          <RowButton label={`Preview question ${number} as a player`} onClick={() => onPreview(index)}>
            <Eye className="size-4" aria-hidden="true" />
          </RowButton>
          <RowButton label={`Edit question ${number} as a card`} onClick={() => onOpenCard(index)}>
            <Pencil className="size-4" aria-hidden="true" />
          </RowButton>
          <RowButton label={`Delete question ${number}`} onClick={() => dispatch({ type: "removeQuestion", level, key })} danger>
            <Trash2 className="size-4" aria-hidden="true" />
          </RowButton>
        </div>
      </td>
    </tr>
  );
});

function RowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-text",
        danger && "hover:text-error"
      )}
    >
      {children}
    </button>
  );
}

/** The right answer(s) as letters. What is typed is read when the cell is left; text that can't be read stays red. */
function CorrectCell({
  level,
  question,
  index,
  column,
  dispatch,
}: {
  level: Level;
  question: DraftQuestion;
  index: number;
  column: number;
  dispatch: Dispatch<EditorAction>;
}) {
  const shown = correctLetters(question);
  // null while the cell shows what the question has; text while it is being typed or was refused.
  const [typed, setTyped] = useState<string | null>(null);
  const problem = typed !== null ? setCorrectFromText(question, typed).problem : undefined;

  // When the question changes underneath (a paste, the card view), show it as it is.
  useEffect(() => setTyped(null), [shown]);

  return (
    <>
      <input
        type="text"
        data-row={index}
        data-col={column}
        value={typed ?? shown}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={() => {
          if (typed === null) return;
          if (!problem) {
            dispatch({ type: "gridCorrect", level, key: question.key, value: typed });
            setTyped(null);
          }
        }}
        aria-label={`Correct answer of question ${index + 1}`}
        aria-invalid={problem ? true : undefined}
        placeholder="e.g. B"
        className={cn(cellClasses, "font-mono", problem && "border-error")}
      />
      {problem && <p className="px-2 pb-1 text-xs text-error">{problem}</p>}
    </>
  );
}
