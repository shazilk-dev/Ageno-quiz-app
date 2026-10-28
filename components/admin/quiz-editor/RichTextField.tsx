"use client";

import { Bold, ChevronRight, CircleHelp, Code, List, Pencil, Table } from "lucide-react";
import {
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import RichText from "@/components/rich-text/RichText";
import { applyEdit, insertBlock, insertCodeBlock, toggleBold, toggleList, type TextEdit } from "@/lib/rich-text/edit";
import { tableToMarkdown } from "@/lib/rich-text/build";
import { tableFromClipboard } from "@/lib/rich-text/paste";
import { parseRichText } from "@/lib/rich-text/parse";
import { hasStructure, structureOf } from "@/lib/rich-text/plain";
import { findTableAt, type TableSpan } from "@/lib/rich-text/table-at";
import { cn } from "@/lib/utils";
import { FormattingHelp } from "./FormattingHelp";
import { TableEditorDialog } from "./TableEditorDialog";

interface RichTextFieldProps {
  id: string;
  label: string;
  /** Quiet text after the label. */
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Rows the box starts with; it grows with the text. */
  minRows?: number;
  /** Shows a count once the text is within a fifth of this. */
  maxLength?: number;
}

type OpenDialog = { kind: "insert"; at: number } | { kind: "edit"; span: TableSpan } | { kind: "help" } | null;

/** What it takes to undo a paste that was turned into a table: the clipboard's own text, as the browser would have pasted it. */
interface PasteNotice {
  /** The whole text right after the paste: the notice goes away as soon as it is anything else. */
  after: string;
  /** Where the table starts, and how long it is with the blank lines around it. */
  from: number;
  length: number;
  /** What goes there instead (the spaces next to the paste are put back too), and where the cursor goes after. */
  restore: string;
  caret: number;
}

const fieldClasses =
  "w-full resize-none overflow-y-auto rounded-md border border-control-border bg-surface px-3 py-2 leading-relaxed text-text transition-fast placeholder:text-text-faint hover:border-text-muted focus-visible:border-accent";

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-text sm:size-9"
    >
      {children}
    </button>
  );
}

/**
 * The textarea for a question or an explanation, with what it takes to write a table in it: a small toolbar
 * (table, bold, list, code, help), a paste that turns cells copied from Excel, Sheets or Word into a Markdown
 * table, advice about a broken table, and a live preview that opens by itself once the text has structure.
 * The value is still the plain string the quiz stores.
 */
export function RichTextField({ id, label, hint, value, onChange, minRows = 3, maxLength }: RichTextFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const previewId = useId();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [inTable, setInTable] = useState(false);
  const [notice, setNotice] = useState<PasteNotice | null>(null);
  const [previewChoice, setPreviewChoice] = useState<boolean | null>(null);
  // Where to put the selection after the next render (when the browser did not make the change itself).
  const pendingSelection = useRef<[number, number] | null>(null);
  // Until the box has been used its selection is not the author's: a toolbar click goes to the end.
  const touched = useRef(false);

  // Typing stays quick: the preview and the advice catch up a moment later.
  const deferred = useDeferredValue(value);
  const parsed = useMemo(() => parseRichText(deferred), [deferred]);
  const structure = structureOf(parsed.blocks);
  const previewOpen = previewChoice ?? hasStructure(parsed.blocks);
  const advice = parsed.diagnostics.slice(0, 2);

  // The box grows with its text (jsdom has no layout, so there it stays at `rows`).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.7)}px`;
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    const pending = pendingSelection.current;
    if (el && pending) {
      pendingSelection.current = null;
      el.setSelectionRange(pending[0], pending[1]);
    }
  });

  const selection = (): [number, number] => {
    const el = ref.current;
    if (!el) return [value.length, value.length];
    return touched.current ? [el.selectionStart, el.selectionEnd] : [el.value.length, el.value.length];
  };

  const refreshCursor = () => {
    const el = ref.current;
    if (!el) return;
    touched.current = true;
    setInTable(el.value.includes("|") && findTableAt(el.value, el.selectionStart) !== null);
  };

  /** Hands the change to the browser so Undo still works; if it will not, sets the value and the selection ourselves. */
  const apply = (edit: TextEdit) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(edit.from, edit.to);
    let done = false;
    try {
      done = edit.insert !== "" && typeof document.execCommand === "function" && document.execCommand("insertText", false, edit.insert);
    } catch {
      done = false;
    }
    if (done) {
      el.setSelectionRange(edit.selectFrom, edit.selectTo);
    } else {
      pendingSelection.current = [edit.selectFrom, edit.selectTo];
      onChange(applyEdit(el.value, edit));
    }
    touched.current = true;
  };

  const handleChange = (next: string) => {
    if (notice && next !== notice.after) setNotice(null);
    onChange(next);
  };

  const insertTable = (markdown: string, at: number) => {
    const el = ref.current;
    if (el) apply(insertBlock(el.value, at, at, markdown));
  };

  const confirmTable = (markdown: string) => {
    const current = dialog;
    setDialog(null);
    if (current?.kind === "insert") insertTable(markdown, current.at);
    if (current?.kind === "edit") {
      const cursor = current.span.from + markdown.length;
      apply({ from: current.span.from, to: current.span.to, insert: markdown, selectFrom: cursor, selectTo: cursor });
    }
    refreshCursor();
  };

  const closeDialog = () => {
    setDialog(null);
    ref.current?.focus();
  };

  const openEditTable = () => {
    const el = ref.current;
    const span = el ? findTableAt(el.value, el.selectionStart) : null;
    if (span) setDialog({ kind: "edit", span });
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    if (!data) return;
    const raw = data.getData("text/plain");
    const cells = tableFromClipboard({ html: data.getData("text/html"), text: raw });
    if (!cells) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { value: before, selectionStart, selectionEnd } = el;
    const edit = insertBlock(before, selectionStart, selectionEnd, tableToMarkdown(cells));
    const after = applyEdit(before, edit);
    const plain = (raw || cells.map((row) => row.join("\t")).join("\n")).replace(/\r\n?/g, "\n");
    const lead = before.slice(edit.from, selectionStart);
    apply(edit);
    setNotice({
      after,
      from: edit.from,
      length: edit.insert.length,
      restore: lead + plain + before.slice(selectionEnd, edit.to),
      caret: edit.from + lead.length + plain.length,
    });
  };

  const pasteAsText = () => {
    const el = ref.current;
    if (!notice || !el || el.value !== notice.after) {
      setNotice(null);
      return;
    }
    apply({
      from: notice.from,
      to: notice.from + notice.length,
      insert: notice.restore,
      selectFrom: notice.caret,
      selectTo: notice.caret,
    });
    setNotice(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "b") {
      event.preventDefault();
      const [from, to] = selection();
      apply(toggleBold(event.currentTarget.value, from, to));
    }
  };

  const tool = (make: (text: string, from: number, to: number) => TextEdit) => () => {
    const el = ref.current;
    if (!el) return;
    const [from, to] = selection();
    apply(make(el.value, from, to));
    refreshCursor();
  };

  const showCount = maxLength !== undefined && value.length >= maxLength * 0.8;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {hint && <span className="ml-2 font-normal text-text-muted">{hint}</span>}
        </label>
        <div role="toolbar" aria-label="Formatting" className="-mr-1 flex flex-wrap items-center">
          <ToolButton
            label="Insert table"
            onClick={() => setDialog({ kind: "insert", at: selection()[1] })}
          >
            <Table className="size-4" aria-hidden="true" />
          </ToolButton>
          {inTable && (
            <ToolButton label="Edit table" onClick={openEditTable}>
              <Pencil className="size-4" aria-hidden="true" />
            </ToolButton>
          )}
          <ToolButton label="Bold (Ctrl+B)" onClick={tool(toggleBold)}>
            <Bold className="size-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Bulleted list" onClick={tool(toggleList)}>
            <List className="size-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Code block" onClick={tool(insertCodeBlock)}>
            <Code className="size-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Formatting help" onClick={() => setDialog({ kind: "help" })}>
            <CircleHelp className="size-4" aria-hidden="true" />
          </ToolButton>
        </div>
      </div>

      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={minRows}
        onChange={(event) => {
          handleChange(event.target.value);
          refreshCursor();
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onSelect={refreshCursor}
        onFocus={refreshCursor}
        className={cn(fieldClasses, "max-h-[70vh]")}
      />

      <div role="status" className="text-sm text-text-muted">
        {notice && (
          <p className="mt-1">
            Pasted as a table.{" "}
            <button type="button" onClick={pasteAsText} className="text-link underline underline-offset-2">
              Paste as plain text instead
            </button>
          </p>
        )}
      </div>

      {advice.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-sm text-warm-text">
          {advice.map((item, index) => (
            <li key={index}>
              {value.includes("\n") ? `Line ${item.line}: ` : ""}
              {item.message}
            </li>
          ))}
        </ul>
      )}

      {showCount && (
        <p className={cn("mt-1 text-right font-mono text-xs", value.length > (maxLength ?? Infinity) ? "text-error" : "text-text-muted")}>
          {value.length} / {maxLength}
        </p>
      )}

      <div className="mt-1">
        <button
          type="button"
          onClick={() => setPreviewChoice(!previewOpen)}
          aria-expanded={previewOpen}
          aria-controls={previewId}
          className="inline-flex min-h-8 items-center gap-1 rounded-md text-sm text-text-muted transition-fast hover:text-text"
        >
          <ChevronRight className={cn("size-4 transition-fast", previewOpen && "rotate-90")} aria-hidden="true" />
          Preview
          {structure.length > 0 && <span className="ml-1 font-mono text-xs">{structure.join(", ")}</span>}
        </button>
        {previewOpen && (
          <div id={previewId} className="mt-1 rounded-md border border-border bg-bg p-3 text-text">
            {deferred.trim() ? <RichText text={deferred} /> : <p className="text-sm text-text-muted">Nothing to show yet.</p>}
          </div>
        )}
      </div>

      {dialog?.kind === "insert" && <TableEditorDialog mode="insert" onClose={closeDialog} onConfirm={confirmTable} />}
      {dialog?.kind === "edit" && (
        <TableEditorDialog
          mode="edit"
          cells={dialog.span.cells}
          align={dialog.span.align}
          onClose={closeDialog}
          onConfirm={confirmTable}
        />
      )}
      {dialog?.kind === "help" && <FormattingHelp onClose={closeDialog} />}
    </div>
  );
}
