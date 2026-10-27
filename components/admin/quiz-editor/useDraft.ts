import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft, type StoredDraft } from "./draft-storage";
import { snapshotOf, type FormState } from "./editor-state";

/** How long typing has to pause before a copy is kept on the device. */
export const DRAFT_DELAY_MS = 800;

interface DraftOptions {
  /** The quiz being edited; null while creating. */
  quizId: string | null;
  form: FormState;
  /** True once the quiz (or the blank form) is on screen; nothing is read or kept before that. */
  ready: boolean;
  /** Changes each time the editor loads a quiz, so a draft is looked for again after a reload. */
  session: number;
  /** The snapshot the editor compares with to know whether anything changed. */
  baseline: string;
  /** The quiz's version when it was loaded. */
  version: number;
  dirty: boolean;
}

/**
 * Keeps the editor's unsaved work on this device and offers it back the next time the quiz is opened.
 * Nothing is kept while the form matches what is saved, a stored copy that matches it is dropped, and a copy
 * that differs is held in `found` until the admin restores or discards it (nothing overwrites it meanwhile).
 */
export function useDraft({ quizId, form, ready, session, baseline, version, dirty }: DraftOptions) {
  const [found, setFound] = useState<StoredDraft | null>(null);
  const [kept, setKept] = useState<"saved" | "failed" | null>(null);
  // The session whose stored copy has been looked at; nothing is kept or cleared before that.
  const [checked, setChecked] = useState<number | null>(null);
  const latest = useRef({ form, version, dirty, found, ready });
  useEffect(() => {
    latest.current = { form, version, dirty, found, ready };
  });
  const baselineRef = useRef(baseline);
  useEffect(() => {
    baselineRef.current = baseline;
  });

  // Look for a copy once the quiz is on screen.
  useEffect(() => {
    if (!ready) return;
    const stored = loadDraft(quizId);
    if (stored && snapshotOf(stored.form) !== baselineRef.current) {
      setFound(stored);
    } else {
      if (stored) clearDraft(quizId);
      setFound(null);
    }
    setKept(null);
    setChecked(session);
  }, [ready, session, quizId]);

  const write = useCallback(() => {
    const state = latest.current;
    if (!state.ready || state.found || !state.dirty) return;
    setKept(saveDraft(quizId, state.form, state.version) ? "saved" : "failed");
  }, [quizId]);

  // Keep a copy shortly after the last change, and drop it when the form is back to what is saved.
  useEffect(() => {
    if (!ready || found || checked !== session) return;
    if (!dirty) {
      clearDraft(quizId);
      setKept(null);
      return;
    }
    const timer = setTimeout(write, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [form, dirty, ready, found, checked, session, quizId, write]);

  // A tab that is hidden or closing may never run the timer above.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") write();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", write);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", write);
    };
  }, [write]);

  /** Forget the copy: after a save, or when the admin chooses to throw their changes away. */
  const discard = useCallback(() => {
    clearDraft(quizId);
    setFound(null);
    setKept(null);
  }, [quizId]);

  /** The admin took the stored copy back: it stays on the device until the form is saved or discarded. */
  const accept = useCallback(() => setFound(null), []);

  return { found, kept, discard, accept };
}
