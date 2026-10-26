"use client";

import { FileQuestion, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Dialog,
  EmptyState,
  FilterTabs,
  Input,
  SearchInput,
  Skeleton,
  useToast,
} from "@/components/ui";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import { LEVELS, LEVEL_LABELS, type AdminQuizSummary } from "@/lib/quiz-schema";

const formatDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown";

type View = "active" | "trash";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const totalQuestions = (quiz: AdminQuizSummary) =>
  LEVELS.reduce((sum, level) => sum + (quiz.counts[level] ?? 0), 0);

/** `initial` comes with the page (rendered on the server); later loads go through the API. */
export default function QuizzesClient({ initial = null }: { initial?: AdminQuizSummary[] | null }) {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<AdminQuizSummary[] | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("active");
  // The quiz being moved to the trash, and the one being deleted for good (its title is typed to confirm).
  const [trashing, setTrashing] = useState<AdminQuizSummary | null>(null);
  const [purging, setPurging] = useState<AdminQuizSummary | null>(null);
  const [typedTitle, setTypedTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setQuizzes(null);
    try {
      setQuizzes(await adminQuizzes.list());
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError ? failure.message : "We couldn't load the quizzes. Try again."
      );
    }
  }, []);

  const hadInitial = useRef(initial !== null);
  useEffect(() => {
    if (!hadInitial.current) void load();
  }, [load]);

  const trashed = useMemo(() => quizzes?.filter((quiz) => quiz.deletedAt !== null) ?? [], [quizzes]);
  const inUse = useMemo(() => quizzes?.filter((quiz) => quiz.deletedAt === null) ?? [], [quizzes]);

  const visible = useMemo(() => {
    const list = view === "trash" ? trashed : inUse;
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((quiz) =>
      [quiz.title, quiz.description, quiz.accessCode].some((text) => text.toLowerCase().includes(term))
    );
  }, [view, trashed, inUse, search]);

  const failureMessage = (failure: unknown, fallback: string) =>
    failure instanceof ApiRequestError ? failure.message : fallback;

  const moveToTrash = async () => {
    if (!trashing) return;
    setBusy(true);
    setDialogError(null);
    try {
      await adminQuizzes.trash(trashing.id);
      const at = Date.now();
      setQuizzes((current) =>
        current?.map((quiz) => (quiz.id === trashing.id ? { ...quiz, deletedAt: at } : quiz)) ?? null
      );
      toast({
        title: "Moved to the trash",
        description: "Players can't see it any more. Restore it from the Trash tab.",
        variant: "success",
      });
      setTrashing(null);
    } catch (failure) {
      setDialogError(failureMessage(failure, "We couldn't move the quiz to the trash. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (quiz: AdminQuizSummary) => {
    try {
      await adminQuizzes.restore(quiz.id);
      setQuizzes((current) =>
        current?.map((item) => (item.id === quiz.id ? { ...item, deletedAt: null } : item)) ?? null
      );
      toast({ title: "Quiz restored", description: `"${quiz.title}" is back.`, variant: "success" });
    } catch (failure) {
      toast({
        title: "Couldn't restore the quiz",
        description: failureMessage(failure, "Try again."),
        variant: "error",
      });
    }
  };

  const deleteForever = async () => {
    if (!purging) return;
    setBusy(true);
    setDialogError(null);
    try {
      const { deletedResults } = await adminQuizzes.deleteForever(purging.id, typedTitle);
      setQuizzes((current) => current?.filter((quiz) => quiz.id !== purging.id) ?? null);
      toast({
        title: "Quiz deleted for good",
        description: deletedResults > 0 ? `${plural(deletedResults, "result")} deleted with it.` : undefined,
        variant: "success",
      });
      setPurging(null);
    } catch (failure) {
      setDialogError(failureMessage(failure, "We couldn't delete the quiz. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const newQuiz = (
    <Button asChild>
      <Link href="/quizzes/new">
        <Plus className="size-4" aria-hidden="true" />
        New quiz
      </Link>
    </Button>
  );

  return (
    <AdminPage
      title="Quizzes"
      description="Create and edit the quizzes players can take. A deleted quiz waits in the trash until you delete it for good."
      actions={newQuiz}
    >
      {error && (
        <Alert
          variant="error"
          title="Couldn't load the quizzes"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!error && quizzes === null && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading quizzes">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      )}

      {quizzes && quizzes.length === 0 && (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Create your first quiz and it will show up here, ready to share."
          action={newQuiz}
        />
      )}

      {quizzes && quizzes.length > 0 && (
        <>
          <SearchInput
            label="Search quizzes"
            placeholder="Search by title, description or code"
            value={search}
            onChange={setSearch}
            className="mb-6 max-w-md"
          />

          <div className="mb-6 border-b border-border">
            <FilterTabs<View>
              label="Show quizzes"
              value={view}
              onChange={setView}
              options={[
                { value: "active", label: "Quizzes", count: inUse.length },
                { value: "trash", label: "Trash", count: trashed.length },
              ]}
            />
          </div>

          {view === "trash" && trashed.length > 0 && (
            <p className="mb-4 max-w-[65ch] text-sm text-text-muted">
              Quizzes here are hidden from players and left off the leaderboards, but nothing is deleted.
              Restoring one brings everything back.
            </p>
          )}

          {visible.length === 0 ? (
            search.trim() ? (
              <EmptyState
                title="No quizzes match"
                description={`Nothing matches "${search.trim()}".`}
                action={
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={view === "trash" ? Trash2 : FileQuestion}
                title={view === "trash" ? "The trash is empty" : "Every quiz is in the trash"}
                description={
                  view === "trash"
                    ? "A quiz you delete waits here until you restore it or delete it for good."
                    : "Restore one from the Trash tab, or create a new quiz."
                }
              />
            )
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {visible.map((quiz) => (
                <li key={quiz.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/quizzes/${quiz.id}`}
                        className="text-lg font-medium text-text transition-fast hover:text-link"
                      >
                        {quiz.title}
                      </Link>
                      {quiz.deletedAt !== null && <Badge>In the trash</Badge>}
                      {quiz.deletedAt === null && !quiz.active && <Badge>Closed</Badge>}
                      {!quiz.isPublic && <Badge variant="outline">Not listed</Badge>}
                      {quiz.examMode === "strict" && <Badge variant="outline">Strict</Badge>}
                    </div>
                    {quiz.description && (
                      <p className="mt-1 line-clamp-1 text-sm text-text-muted">{quiz.description}</p>
                    )}
                    <p className="mt-2 font-mono text-sm text-text-muted">
                      {totalQuestions(quiz)} questions
                      {LEVELS.filter((level) => quiz.counts[level]).map((level) => (
                        <span key={level}>
                          {" · "}
                          {LEVEL_LABELS[level]} {quiz.counts[level]}
                        </span>
                      ))}
                      {" · "}
                      {quiz.responseCount} {quiz.responseCount === 1 ? "result" : "results"}
                      {" · "}
                      {formatDate(quiz.createdAt)}
                    </p>
                    {quiz.accessCode && (
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <span className="font-mono tracking-[0.1em]">{quiz.accessCode}</span>
                        <CopyButton text={quiz.accessCode} label="Copy code" />
                        <span className="text-text-muted">
                          {quiz.requiresAccessCode ? "required to start" : "optional"}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/quizzes/${quiz.id}`}>View</Link>
                    </Button>
                    {quiz.deletedAt === null ? (
                      <>
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/quizzes/${quiz.id}/edit`}>Edit</Link>
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setDialogError(null);
                            setTrashing(quiz);
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => void restore(quiz)}>
                          Restore
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setDialogError(null);
                            setTypedTitle("");
                            setPurging(quiz);
                          }}
                        >
                          Delete forever
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={trashing !== null}
        onClose={() => !busy && setTrashing(null)}
        dismissible={!busy}
        title={trashing ? `Move "${trashing.title}" to the trash?` : "Delete quiz"}
        description={
          trashing
            ? `Players won't be able to find or start it, and it leaves the leaderboards. Its ${plural(totalQuestions(trashing), "question")} and ${plural(trashing.responseCount, "result")} are kept, and you can restore it any time.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setTrashing(null)} disabled={busy}>
              Keep quiz
            </Button>
            <Button variant="danger" onClick={moveToTrash} loading={busy}>
              Move to trash
            </Button>
          </>
        }
      >
        {dialogError && <Alert variant="error">{dialogError}</Alert>}
      </Dialog>

      <Dialog
        open={purging !== null}
        onClose={() => !busy && setPurging(null)}
        dismissible={!busy}
        title={purging ? `Delete "${purging.title}" for good?` : "Delete quiz"}
        description={
          purging
            ? `This permanently deletes the quiz, its ${plural(totalQuestions(purging), "question")} and the ${plural(purging.responseCount, "result")} people earned on it. It can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurging(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={deleteForever}
              loading={busy}
              disabled={!purging || typedTitle.trim() !== purging.title.trim()}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Type the quiz's title to confirm"
            value={typedTitle}
            onChange={(event) => setTypedTitle(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {dialogError && <Alert variant="error">{dialogError}</Alert>}
        </div>
      </Dialog>
    </AdminPage>
  );
}
