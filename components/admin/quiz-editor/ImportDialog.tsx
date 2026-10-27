"use client";

import { useState } from "react";
import { CheckStep } from "@/components/admin/quiz-import/CheckStep";
import { SourceStep } from "@/components/admin/quiz-import/SourceStep";
import { MODE_HELP, MODE_OPTIONS } from "@/components/admin/quiz-import/TargetStep";
import { useImportSession } from "@/components/admin/quiz-import/useImportSession";
import { Button, Dialog, SegmentedControl } from "@/components/ui";
import type { ParsedImport } from "@/lib/quiz-format/types";
import { applyImport, type ImportMode } from "@/lib/quiz-import/apply";
import { LEVELS, LEVEL_LABELS, type EditorQuestion, type Level } from "@/lib/quiz-schema";

interface ImportDialogProps {
  open: boolean;
  /** The level on screen: questions that name no level go here. */
  level: Level;
  /** What each level holds now. */
  current: Record<Level, readonly EditorQuestion[]>;
  onClose: () => void;
  /** The new contents of a level. */
  onApply: (level: Level, questions: EditorQuestion[]) => void;
}

/** What the file holds, with the same checks as the Import page; the result goes into the editor's draft, unsaved. */
function Review({
  parsed,
  level,
  current,
  onBack,
  onApply,
  onDone,
}: {
  parsed: ParsedImport;
  level: Level;
  current: ImportDialogProps["current"];
  onBack: () => void;
  onApply: ImportDialogProps["onApply"];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>("add");
  const session = useImportSession(parsed, current, level);
  const levels = LEVELS.filter((name) => (session.ready[name]?.length ?? 0) > 0);

  const apply = () => {
    for (const name of levels) {
      onApply(name, applyImport(current[name], session.ready[name] ?? [], mode));
    }
    onDone();
  };

  return (
    <div className="space-y-6">
      <CheckStep session={session} fileIssues={parsed.issues} />
      {session.count > 0 && (
        <div className="space-y-2">
          <SegmentedControl<ImportMode>
            label="What should happen to the levels in the file?"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
          />
          <p className="max-w-[65ch] text-sm text-text-muted">{MODE_HELP[mode]}</p>
          <p className="text-sm text-text-muted">
            Into: {levels.map((name) => `${LEVEL_LABELS[name]} (${session.ready[name]?.length})`).join(", ")}. Nothing is saved
            until you save the quiz.
          </p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onBack}>
          Start again
        </Button>
        <Button onClick={apply} disabled={session.count === 0}>
          Add {session.count} {session.count === 1 ? "question" : "questions"} to the editor
        </Button>
      </div>
    </div>
  );
}

/** Import into the quiz being edited: read, check and fix the rows, then put them in the draft. */
export function ImportDialog({ open, level, current, onClose, onApply }: ImportDialogProps) {
  const [read, setRead] = useState<{ id: number; parsed: ParsedImport } | null>(null);

  const close = () => {
    setRead(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import questions"
      description="From a file an AI made, a spreadsheet or plain text. You can fix or leave out any question before it goes in."
      className="max-w-3xl"
    >
      {open &&
        (read ? (
          <Review
            key={read.id}
            parsed={read.parsed}
            level={level}
            current={current}
            onBack={() => setRead(null)}
            onApply={onApply}
            onDone={close}
          />
        ) : (
          <SourceStep onRead={(parsed) => setRead({ id: Date.now(), parsed })} showHelpLink={false} />
        ))}
    </Dialog>
  );
}
