"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import { editorReducer } from "@/components/admin/quiz-editor/editor-state";
import type { ParsedImport } from "@/lib/quiz-format/types";
import type { EditorQuestion, Level } from "@/lib/quiz-schema";
import { checkStaged, importable, moveUnplaced, stage, unplacedLevel } from "./staging";

/**
 * The state of one import after the file has been read: the rows (as an editor form, so a row is fixed with
 * the editor's own question card), which ones the admin left out, and what each check says. Mount it fresh
 * for each file (give the component a `key`).
 */
export function useImportSession(
  parsed: ParsedImport,
  existing?: Partial<Record<Level, readonly EditorQuestion[]>>,
  /** Where questions that name no level go to begin with. */
  fallback: Level = "easy"
) {
  const [initial] = useState(() => stage(parsed, fallback));
  const [meta] = useState(initial.meta);
  const [form, dispatch] = useReducer(editorReducer, initial.form);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  const checks = useMemo(() => checkStaged(form, meta, skipped, existing), [form, meta, skipped, existing]);
  const ready = useMemo(() => importable(checks.rows), [checks.rows]);
  const unplaced = unplacedLevel(form, meta);

  const toggleSkip = useCallback((key: string) => {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Where the questions that came with no level go. */
  const placeUnplaced = useCallback(
    (to: Level) => {
      if (unplaced) dispatch({ type: "load", form: moveUnplaced(form, meta, unplaced, to) });
    },
    [form, meta, unplaced]
  );

  const count = Object.values(ready).reduce((sum, list) => sum + list.length, 0);

  return { form, dispatch, meta, skipped, toggleSkip, checks, ready, count, unplaced, placeUnplaced };
}

export type ImportSession = ReturnType<typeof useImportSession>;
