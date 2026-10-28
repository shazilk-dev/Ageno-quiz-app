"use client";

import RichText from "@/components/rich-text/RichText";
import { CopyButton, Dialog } from "@/components/ui";
import { SCENARIO_EXAMPLE } from "@/lib/rich-text/example";

const SYNTAX: { what: string; type: string; note?: string }[] = [
  { what: "New paragraph", type: "an empty line", note: "A single line break also stays a line break." },
  { what: "Bold", type: "**bold**" },
  { what: "Italic", type: "_italic_" },
  { what: "Code", type: "`code`" },
  { what: "List", type: "- first\n- second", note: "Two or more lines. Numbered: 1. first" },
  { what: "Code block", type: "```\nline of code\n```" },
  { what: "Table", type: "| A | B |\n|---|---|\n| 1 | 2 |", note: "Easier: the table button, or paste cells from Excel, Sheets or Word." },
  { what: "A | inside a cell", type: "\\|" },
  { what: "Show a mark as it is", type: "\\*  \\_  \\`" },
];

/** What can be typed in a question or an explanation, with the scenario + table example (copyable). */
export function FormattingHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Formatting help"
      description="Questions and explanations can hold a table, a list or a code block. Answer options and reasons take bold, italic and code only. HTML, links and pictures are not supported (a picture goes in the image field)."
      className="max-w-2xl"
    >
      <div className="space-y-6">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">What to type for each kind of formatting</caption>
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th scope="col" className="py-1.5 pr-4 font-medium">
                For
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {SYNTAX.map((row) => (
              <tr key={row.what} className="border-b border-border align-top">
                <th scope="row" className="py-2 pr-4 font-normal">
                  {row.what}
                </th>
                <td className="py-2">
                  <code className="whitespace-pre font-mono text-text">{row.type}</code>
                  {row.note && <p className="mt-1 text-text-muted">{row.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Example: a scenario, a table, then the question</h3>
            <CopyButton text={SCENARIO_EXAMPLE} label="Copy example" />
          </div>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-sm text-text">
            {SCENARIO_EXAMPLE}
          </pre>
          <p className="mt-3 text-sm text-text-muted">Players see:</p>
          <div className="mt-2 rounded-md border border-border bg-bg p-3">
            <RichText text={SCENARIO_EXAMPLE} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
