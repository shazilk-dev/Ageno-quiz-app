"use client";

import { useState } from "react";
import { Alert, Button, Dialog, Textarea } from "@/components/ui";
import { LEVEL_LABELS, parseImportedQuestions, type Level } from "@/lib/quiz-schema";
import { draftQuestion, type DraftQuestion } from "./editor-state";

interface ImportDialogProps {
  open: boolean;
  level: Level;
  hasQuestions: boolean;
  onClose: () => void;
  onImport: (questions: DraftQuestion[], mode: "append" | "replace") => void;
}

/** Paste exported JSON (or load a .json file) to add questions to one level. */
export function ImportDialog({ open, level, hasQuestions, onClose, onImport }: ImportDialogProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setText("");
    setError(null);
    onClose();
  };

  const submit = () => {
    const result = parseImportedQuestions(text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onImport(result.questions.map((question) => draftQuestion(question)), hasQuestions ? mode : "append");
    close();
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setText(await file.text());
      setError(null);
    } catch {
      setError("We couldn't read that file.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Import ${LEVEL_LABELS[level].toLowerCase()} questions`}
      description="Paste a list of questions as JSON, or choose a file. Questions you export from here import back in."
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!text.trim()}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea
          label="Questions (JSON)"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          className="min-h-48 font-mono text-sm"
          spellCheck={false}
        />
        <div>
          <label htmlFor="import-file" className="mb-2 block text-sm font-medium">
            Or choose a file
          </label>
          <input
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => loadFile(event.target.files?.[0])}
            className="block w-full text-sm text-text-muted file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:text-text"
          />
        </div>
        {hasQuestions && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">This level already has questions</legend>
            <div className="space-y-1">
              {(
                [
                  ["append", "Add them after the current questions"],
                  ["replace", "Replace the current questions"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="size-5 accent-[var(--color-teal)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}
