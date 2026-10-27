"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { Alert, Button, Dialog, Skeleton, useToast } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { adminQuizzes } from "@/lib/admin-api";
import { LEVELS, type Level, type ValidationIssue } from "@/lib/quiz-schema";
import { DetailsSection } from "./DetailsSection";
import { LevelsSection, type EditorView } from "./LevelsSection";
import { useDraft } from "./useDraft";
import {
  blankForm,
  editorReducer,
  formFromDetail,
  snapshotOf,
  validateForm,
} from "./editor-state";

type QuizEditorProps = { mode: "create" } | { mode: "edit"; quizId: string };

type Loading = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

const MAX_LISTED_ISSUES = 5;
const VIEW_KEY = "ageno:admin:editor-view";

const formatWhen = (ms: number) =>
  ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "earlier";

/** Enter in a text box would submit the form, and with it save and leave the editor. Only the buttons do that. */
function noEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return;
  const target = event.target;
  if (target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(target.type)) {
    event.preventDefault();
  }
}

/**
 * The one quiz editor, for creating and for editing. It holds the whole quiz as a draft, checks it with the
 * same rules the server uses, and saves the quiz and its questions in a single request.
 */
export function QuizEditor(props: QuizEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = props.mode === "edit";
  const quizId = props.mode === "edit" ? props.quizId : null;

  const [form, dispatch] = useReducer(editorReducer, undefined, blankForm);
  const [loading, setLoading] = useState<Loading>(editing ? { state: "loading" } : { state: "ready" });
  const [version, setVersion] = useState(0);
  const [unfinished, setUnfinished] = useState(false);
  const [baseline, setBaseline] = useState(() => snapshotOf(blankForm()));
  const [session, setSession] = useState(0);
  const [level, setLevel] = useState<Level>("easy");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [view, setView] = useState<EditorView>("cards");
  const [jumpTo, setJumpTo] = useState<{ level: Level; question: number } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const loadQuiz = useCallback(async () => {
    if (!quizId) return;
    setLoading({ state: "loading" });
    try {
      const detail = await adminQuizzes.get(quizId);
      const loaded = formFromDetail(detail);
      dispatch({ type: "load", form: loaded });
      setBaseline(snapshotOf(loaded));
      setVersion(detail.version);
      setUnfinished(detail.updateUnfinished === true);
      setLevel(LEVELS.find((value) => loaded.levels[value].questions.length > 0) ?? "easy");
      setSession((count) => count + 1);
      setIssues([]);
      setSaveError(null);
      setLoading({ state: "ready" });
    } catch (error) {
      setLoading({
        state: "error",
        message:
          error instanceof ApiRequestError && error.status === 404
            ? "That quiz doesn't exist. It may have been deleted."
            : error instanceof ApiRequestError
              ? error.message
              : "We couldn't load this quiz. Try again.",
      });
    }
  }, [quizId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  // The view an admin last used is a convenience; the page works without storage.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
    } catch {
      // Storage may be blocked.
    }
  }, []);

  const changeView = (next: EditorView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };

  const jump = (target: Level, question?: number) => {
    setLevel(target);
    if (question !== undefined) setJumpTo({ level: target, question });
  };

  const dirty = loading.state === "ready" && snapshotOf(form) !== baseline;

  const draft = useDraft({
    quizId,
    form,
    ready: loading.state === "ready",
    session,
    baseline,
    version,
    dirty,
  });

  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  // After a failed check, move to the list of problems; a broken question below then takes the focus.
  useEffect(() => {
    if (issues.length > 0) summaryRef.current?.focus();
  }, [issues]);

  // After a failed check, bring the first broken question into view.
  useEffect(() => {
    if (!jumpTo || jumpTo.level !== level) return;
    const key = form.levels[jumpTo.level].questions[jumpTo.question]?.key;
    const card = key ? document.getElementById(`question-${key}`) : null;
    if (card) {
      card.scrollIntoView({ block: "center" });
      card.querySelector<HTMLElement>("textarea, input[type=text]")?.focus({ preventScroll: true });
    }
    setJumpTo(null);
  }, [jumpTo, level, form]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaveError(null);

    const result = validateForm(form);
    if (!result.ok) {
      setIssues(result.issues);
      const first = result.issues.find((issue) => issue.level);
      if (first?.level) {
        setLevel(first.level);
        if (first.question !== undefined) setJumpTo({ level: first.level, question: first.question });
      }
      return;
    }
    setIssues([]);

    setSaving(true);
    try {
      if (quizId) {
        await adminQuizzes.save(quizId, result.value, version);
        toast({ title: "Quiz saved", variant: "success" });
      } else {
        const created = await adminQuizzes.create(result.value);
        toast({
          title: "Quiz created",
          description: `Access code ${created.accessCode}`,
          variant: "success",
        });
      }
      setBaseline(snapshotOf(form));
      draft.discard();
      router.push("/quizzes");
    } catch (error) {
      setSaveError({
        message: error instanceof ApiRequestError ? error.message : "We couldn't save the quiz. Try again.",
        stale: error instanceof ApiRequestError && error.code === "quiz_changed",
      });
      setSaving(false);
    }
  };

  const leave = () => (dirty ? setConfirmingLeave(true) : router.push("/quizzes"));

  const title = editing ? "Edit quiz" : "New quiz";
  const description = editing
    ? "Change the details or the questions. Nothing is saved until you press Save."
    : "Set up the quiz, then write the questions for each level.";

  if (loading.state === "loading") {
    return (
      <AdminPage title={title} width="narrow" back={{ href: "/quizzes", label: "All quizzes" }}>
        <div className="space-y-6" aria-busy="true" aria-label="Loading quiz">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPage>
    );
  }

  if (loading.state === "error") {
    return (
      <AdminPage title={title} width="narrow" back={{ href: "/quizzes", label: "All quizzes" }}>
        <Alert
          variant="error"
          title="Couldn't open this quiz"
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadQuiz()}>
              Try again
            </Button>
          }
        >
          {loading.message}
        </Alert>
      </AdminPage>
    );
  }

  const generalIssues = issues.filter((issue) => issue.level === undefined);
  const shownIssues = issues.slice(0, MAX_LISTED_ISSUES);

  return (
    <AdminPage
      title={title}
      description={description}
      width={view === "grid" ? "wide" : "narrow"}
      back={{ href: "/quizzes", label: "All quizzes" }}
    >
      <form
        onSubmit={submit}
        onKeyDown={noEnterSubmit}
        noValidate
        className="space-y-10"
      >
        <div ref={summaryRef} tabIndex={-1} className="outline-none empty:hidden">
          {issues.length > 0 && (
            <Alert variant="error" title="Fix these before saving">
              <ul className="list-disc space-y-1 pl-5">
                {shownIssues.map((issue, index) => (
                  <li key={index}>{issue.message}</li>
                ))}
              </ul>
              {issues.length > shownIssues.length && (
                <p className="mt-2">and {issues.length - shownIssues.length} more.</p>
              )}
            </Alert>
          )}
        </div>

        {draft.found && (
          <Alert
            variant="info"
            title="You have unsaved changes from earlier"
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    dispatch({ type: "load", form: draft.found!.form });
                    draft.accept();
                  }}
                >
                  Restore them
                </Button>
                <Button size="sm" variant="ghost" onClick={draft.discard}>
                  Discard
                </Button>
              </div>
            }
          >
            A copy of your work from {formatWhen(draft.found.savedAt)} was kept on this device.
            {editing && draft.found.baseVersion !== version && (
              <>
                {" "}
                The quiz was saved again after that, so restoring them and saving replaces those newer changes.
              </>
            )}
          </Alert>
        )}

        {unfinished && (
          <Alert variant="warning" title="An earlier update of this quiz didn't finish">
            Part of a large import or save was applied, and players can&apos;t start the quiz until it is finished. What you
            see below is what is stored now. Check it, then save: saving finishes the job.
          </Alert>
        )}

        <div className="max-w-3xl">
          <DetailsSection form={form} issues={generalIssues} dispatch={dispatch} />
        </div>

        <LevelsSection
          form={form}
          level={level}
          onLevelChange={setLevel}
          issues={issues}
          dispatch={dispatch}
          view={view}
          onViewChange={changeView}
          onJump={jump}
        />

        {saveError && (
          <Alert
            variant="error"
            title={saveError.stale ? "This quiz changed while you were editing" : "Couldn't save"}
            action={
              saveError.stale ? (
                <Button variant="secondary" size="sm" onClick={() => void loadQuiz()}>
                  Reload quiz
                </Button>
              ) : undefined
            }
          >
            {saveError.message}
            {saveError.stale && " Reloading shows their version and discards your edits."}
          </Alert>
        )}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-bg px-4 py-3">
          {dirty && (
            <span className="mr-auto font-mono text-sm text-text-muted" role="status">
              Unsaved changes
              {draft.kept === "saved" && " · copy kept on this device"}
              {draft.kept === "failed" && " · couldn't keep a copy on this device"}
            </span>
          )}
          <Button variant="ghost" onClick={leave} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="size-4" aria-hidden="true" />
            {editing ? "Save changes" : "Create quiz"}
          </Button>
        </div>
      </form>

      <Dialog
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
        title="Discard your changes?"
        description="You have changes that aren't saved. If you leave now they're lost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                draft.discard();
                router.push("/quizzes");
              }}
            >
              Discard changes
            </Button>
          </>
        }
      />
    </AdminPage>
  );
}
