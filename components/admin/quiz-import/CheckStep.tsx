"use client";

import { useState } from "react";
import { QuestionCard } from "@/components/admin/quiz-editor/QuestionCard";
import { Alert, Badge, Button, EmptyState, FilterTabs, Select } from "@/components/ui";
import { issueMessage } from "@/lib/quiz-format/checks";
import type { ImportIssue } from "@/lib/quiz-format/types";
import { LEVELS, LEVEL_LABELS, type Level } from "@/lib/quiz-schema";
import { cn } from "@/lib/utils";
import type { RowResult } from "./staging";
import type { ImportSession } from "./useImportSession";

type Show = "all" | "fix" | "check";

const letter = (index: number) => String.fromCharCode(65 + index);

function IssueLine({ issue }: { issue: ImportIssue }) {
  return (
    <li className={cn("text-sm", issue.severity === "error" ? "text-error" : "text-text-muted")}>
      <span className="font-mono text-xs uppercase tracking-[0.05em]">
        {issue.severity === "error" ? "Fix" : "Check"}
      </span>{" "}
      {issueMessage(issue)}
    </li>
  );
}

function RowStatus({ row }: { row: RowResult }) {
  if (row.skipped) return <Badge variant="outline">Left out</Badge>;
  if (row.checked.status === "error") return <Badge variant="outline" className="border-error text-error">Needs fixing</Badge>;
  if (row.checked.status === "warning") return <Badge variant="outline">Check</Badge>;
  return <Badge variant="teal">Ready</Badge>;
}

interface CheckStepProps {
  session: ImportSession;
  /** Problems with the file as a whole (from the reader). */
  fileIssues: ImportIssue[];
}

/** Step 2: every question with its status. Fix a row in place, or leave it out. */
export function CheckStep({ session, fileIssues }: CheckStepProps) {
  const { checks, form, dispatch, toggleSkip, unplaced, placeUnplaced } = session;
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<string | null>(null);

  const needFixing = checks.rows.filter((row) => !row.skipped && row.checked.status === "error");
  const needCheck = checks.rows.filter((row) => !row.skipped && row.checked.status === "warning");
  const visible = checks.rows.filter((row) =>
    show === "all" ? true : show === "fix" ? !row.skipped && row.checked.status === "error" : !row.skipped && row.checked.status === "warning"
  );
  const fileErrors = fileIssues.filter((issue) => issue.severity === "error");
  const fileWarnings = fileIssues.filter((issue) => issue.severity === "warning");

  return (
    <div className="space-y-6">
      <Alert
        variant={needFixing.length > 0 || checks.rows.length === 0 ? "warning" : "success"}
        title={checks.summary.text}
      >
        {needFixing.length > 0
          ? "Fix the questions marked Needs fixing, or leave them out. Only the ready ones are imported."
          : needCheck.length > 0
            ? "Nothing is blocking the import. Have a look at the questions marked Check."
            : "Everything looks fine."}
      </Alert>

      {fileErrors.length > 0 && (
        <Alert variant="error" title="Problems with the file">
          <ul className="list-disc space-y-1 pl-5">
            {fileErrors.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {fileWarnings.length > 0 && (
        <Alert variant="info" title="Things to know">
          <ul className="list-disc space-y-1 pl-5">
            {fileWarnings.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {unplaced && (
        <Select
          label="Questions with no level go to"
          hint="Their level wasn't in the file. They are marked in the list below."
          value={unplaced}
          onChange={(event) => placeUnplaced(event.target.value as Level)}
          wrapperClassName="max-w-xs"
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {LEVEL_LABELS[level]}
            </option>
          ))}
        </Select>
      )}

      {checks.rows.length === 0 ? (
        <EmptyState title="No questions found" description="Go back and check the text, or try another way in." />
      ) : (
        <>
          <div className="border-b border-border">
            <FilterTabs<Show>
              label="Show questions"
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "All", count: checks.rows.length },
                { value: "fix", label: "Needs fixing", count: needFixing.length },
                { value: "check", label: "Check", count: needCheck.length },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-text-muted">Nothing in this list.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {visible.map((row) => {
                const key = row.question.key;
                const isOpen = open === key;
                const indexInLevel = form.levels[row.level].questions.findIndex((question) => question.key === key);
                const issues = row.checked.issues.filter((issue) => !issue.message.startsWith("note: "));
                const correct = row.question.options.flatMap((option, index) => (option.isCorrect ? [letter(index)] : []));
                return (
                  <li key={key} className={cn("p-4", row.skipped && "opacity-60")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <RowStatus row={row} />
                          <span className="font-mono text-xs uppercase tracking-[0.05em] text-text-muted">
                            {row.meta.source} · {LEVEL_LABELS[row.level]}
                            {row.meta.unplaced && " (no level given)"}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 font-medium">{row.question.text.trim() || "(no question text)"}</p>
                        <p className="mt-1 font-mono text-sm text-text-muted">
                          {row.question.type === "multiple" ? "Select all" : "One answer"} · {row.question.options.length} options ·
                          correct: {correct.length > 0 ? correct.join(", ") : "none marked"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : key)}
                        >
                          {isOpen ? "Close" : "Edit"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleSkip(key)}>
                          {row.skipped ? "Include" : "Leave out"}
                        </Button>
                      </div>
                    </div>

                    {row.meta.note && !row.skipped && (
                      <p className="mt-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
                        <span className="font-mono text-xs uppercase tracking-[0.05em]">Note in the file</span>
                        <span className="block">{row.meta.note}</span>
                      </p>
                    )}
                    {!row.skipped && issues.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {issues.map((issue, index) => (
                          <IssueLine key={index} issue={issue} />
                        ))}
                      </ul>
                    )}

                    {isOpen && (
                      <ol className="mt-4">
                        <QuestionCard
                          level={row.level}
                          question={row.question}
                          index={Math.max(0, indexInLevel)}
                          total={form.levels[row.level].questions.length}
                          dispatch={dispatch}
                        />
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
