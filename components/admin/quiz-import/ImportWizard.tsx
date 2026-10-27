"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { Alert, Button } from "@/components/ui";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import type { ParsedImport } from "@/lib/quiz-format/types";
import type { ImportMode } from "@/lib/quiz-import/apply";
import type { AdminQuizDetail, AdminQuizSummary, EditorQuestion, Level, QuizInput } from "@/lib/quiz-schema";
import { CheckStep } from "./CheckStep";
import { planImport, type Target } from "./plan";
import { SourceStep } from "./SourceStep";
import { TargetStep, type TargetKind } from "./TargetStep";
import { useImportSession } from "./useImportSession";

const STEPS = ["Bring it in", "Check", "Import"] as const;

function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm" aria-label="Steps">
      {STEPS.map((name, index) => (
        <li
          key={name}
          aria-current={index === current ? "step" : undefined}
          className={index === current ? "text-text" : "text-text-muted"}
        >
          {index + 1}. {name}
        </li>
      ))}
    </ol>
  );
}

const failureMessage = (failure: unknown, fallback: string) =>
  failure instanceof ApiRequestError ? failure.message : fallback;

type Done = {
  quizId: string;
  title: string;
  accessCode: string;
  created: boolean;
  text: string;
  open: boolean;
};

type Failure = { message: string; code: string | null };

function Review({ parsed, onBack }: { parsed: ParsedImport; onBack: () => void }) {
  const [phase, setPhase] = useState<"check" | "target">("check");
  const [kind, setKind] = useState<TargetKind>("new");
  const [openNow, setOpenNow] = useState(false);
  const [mode, setMode] = useState<ImportMode>("add");
  const [quizzes, setQuizzes] = useState<AdminQuizSummary[] | null>(null);
  const [quizzesError, setQuizzesError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState("");
  const [detail, setDetail] = useState<AdminQuizDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const existing = useMemo(() => {
    if (kind !== "existing" || !detail) return undefined;
    const byLevel: Partial<Record<Level, EditorQuestion[]>> = {};
    for (const level of ["easy", "medium", "hard"] as const) {
      const questions = detail.levels[level]?.questions;
      if (questions) byLevel[level] = questions;
    }
    return byLevel;
  }, [kind, detail]);

  const session = useImportSession(parsed, existing);

  const target: Target | null =
    kind === "new" ? { kind: "new", openNow } : detail ? { kind: "existing", detail, mode } : null;
  const plan = useMemo(
    () => (target ? planImport(session.form, session.ready, target) : null),
    // `target` is rebuilt every render; its parts are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.form, session.ready, kind, openNow, detail, mode]
  );

  // The quiz list is fetched the first time "a quiz I have" is chosen.
  useEffect(() => {
    if (kind !== "existing" || quizzes !== null) return;
    let cancelled = false;
    adminQuizzes
      .list()
      .then((list) => !cancelled && setQuizzes(list))
      .catch((error) => !cancelled && setQuizzesError(failureMessage(error, "We couldn't load your quizzes.")));
    return () => {
      cancelled = true;
    };
  }, [kind, quizzes]);

  const openQuiz = useCallback(async (id: string) => {
    setPickedId(id);
    setDetail(null);
    setDetailError(null);
    setFailure(null);
    if (!id) return;
    setLoadingDetail(true);
    try {
      setDetail(await adminQuizzes.get(id));
    } catch (error) {
      setDetailError(failureMessage(error, "We couldn't open that quiz. Try again."));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const nothingToImport = session.count === 0;
  const titleMissing = kind === "new" && !session.form.title.trim();
  const canImport = !!plan?.input && !nothingToImport && !titleMissing && !saving;
  const big = plan ? plan.total.added + plan.total.changed + plan.total.removed + 1 > 500 : false;

  const save = async (input: QuizInput | null, undoing = false) => {
    if (!input) return;
    setSaving(true);
    setFailure(null);
    try {
      if (kind === "new") {
        const created = await adminQuizzes.create(input);
        setDone({
          quizId: created.id,
          title: input.title,
          accessCode: created.accessCode,
          created: true,
          text: `${session.count} ${session.count === 1 ? "question" : "questions"} imported.`,
          open: input.active,
        });
      } else if (detail) {
        await adminQuizzes.save(detail.id, input, detail.version);
        setDone({
          quizId: detail.id,
          title: detail.title,
          accessCode: detail.accessCode,
          created: false,
          text: undoing ? "The quiz is back as it was before the import." : `${plan?.levels.map((level) => `${level.level}: ${level.text}`).join(" · ")}`,
          open: detail.active,
        });
      }
    } catch (error) {
      setFailure({
        message: failureMessage(error, "We couldn't save. Try again."),
        code: error instanceof ApiRequestError ? (error.code ?? null) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-6">
        <Alert variant="success" title={done.created ? `"${done.title}" is ready` : `"${done.title}" updated`}>
          <p>{done.text}</p>
          {done.created && (
            <p className="mt-2">
              Access code <span className="font-mono tracking-[0.1em]">{done.accessCode}</span>.{" "}
              {done.open ? "Players can start it now." : "It is closed: open it from the editor when you are ready."}
            </p>
          )}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/quizzes/${done.quizId}`}>Look at the quiz</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/quizzes/${done.quizId}/edit`}>Edit it</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/quizzes">All quizzes</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Steps current={phase === "check" ? 1 : 2} />

      {phase === "check" ? (
        <>
          <CheckStep session={session} fileIssues={parsed.issues} />
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Start again
            </Button>
            <Button onClick={() => setPhase("target")} disabled={nothingToImport}>
              Continue with {session.count} {session.count === 1 ? "question" : "questions"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <TargetStep
            session={session}
            kind={kind}
            onKind={(next) => {
              setKind(next);
              setFailure(null);
            }}
            openNow={openNow}
            onOpenNow={setOpenNow}
            quizzes={quizzes}
            quizzesError={quizzesError}
            pickedId={pickedId}
            onPick={(id) => void openQuiz(id)}
            detail={detail}
            loadingDetail={loadingDetail}
            detailError={detailError}
            mode={mode}
            onMode={setMode}
            plan={plan}
          />

          {big && (
            <Alert variant="info" className="mt-6">
              This is a large update. Players can&apos;t start this quiz for a minute or so while it is applied; attempts already
              running are not affected.
            </Alert>
          )}

          {failure && (
            <Alert
              variant="error"
              title={failure.code === "update_interrupted" ? "The update didn't finish" : "Couldn't import"}
              className="mt-6"
              action={
                failure.code === "quiz_changed" && pickedId ? (
                  <Button variant="secondary" size="sm" onClick={() => void openQuiz(pickedId)}>
                    Reload the quiz
                  </Button>
                ) : failure.code === "update_interrupted" ? (
                  <span className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void save(plan?.input ?? null)} disabled={saving}>
                      Try again
                    </Button>
                    {plan?.before && (
                      <Button variant="ghost" size="sm" onClick={() => void save(plan.before, true)} disabled={saving}>
                        Put it back as it was
                      </Button>
                    )}
                  </span>
                ) : undefined
              }
            >
              {failure.message}
              {failure.code === "quiz_changed" && " Reloading shows their version; then check the plan again."}
            </Alert>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setPhase("check")} disabled={saving}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to the questions
            </Button>
            <Button onClick={() => void save(plan?.input ?? null)} disabled={!canImport} loading={saving}>
              <Check className="size-4" aria-hidden="true" />
              {kind === "new" ? "Create the quiz" : "Import into the quiz"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Import a whole quiz, or some questions, from a file, a sheet or text: read, check, choose where, import. */
export function ImportWizard() {
  const [read, setRead] = useState<{ id: number; parsed: ParsedImport } | null>(null);

  return (
    <AdminPage
      title="Import"
      description="Bring in questions from a file an AI made, a spreadsheet or plain text. You see what was found and what will change before anything is saved."
      width="narrow"
      back={{ href: "/quizzes", label: "All quizzes" }}
    >
      {read ? (
        <Review key={read.id} parsed={read.parsed} onBack={() => setRead(null)} />
      ) : (
        <>
          <Steps current={0} />
          <SourceStep onRead={(parsed) => setRead({ id: Date.now(), parsed })} />
        </>
      )}
    </AdminPage>
  );
}
