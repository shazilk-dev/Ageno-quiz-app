// The tree the rich-text parser produces (docs/RICH_TEXT_PLAN.md). One node type per construct: adding a
// construct later means one parser rule, one renderer case and one line in the AI instructions.

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "break" };

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | {
      type: "table";
      /** One entry per column. `null` = no colon in the delimiter row. */
      align: Align[];
      header: Inline[][];
      /** Every row has exactly `header.length` cells (short rows are padded, extra cells dropped). */
      rows: Inline[][][];
    }
  | { type: "list"; ordered: boolean; /** First number of an ordered list. */ start: number; items: Inline[][] }
  | { type: "code"; text: string };

export type DiagnosticKind = "table-columns" | "table-no-header" | "html-tag" | "unclosed-fence";

/** Advice about text that will not show the way its author probably meant. Never changes the tree. */
export interface Diagnostic {
  kind: DiagnosticKind;
  /** 1-based line of the text. */
  line: number;
  message: string;
}

export interface ParseOptions {
  /** `"inline"`: no tables, lists or code blocks, only bold, italic, code and line breaks (option text). */
  blocks?: "all" | "inline";
}

export interface ParseResult {
  blocks: Block[];
  diagnostics: Diagnostic[];
}
