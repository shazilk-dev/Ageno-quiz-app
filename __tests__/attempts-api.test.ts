// Integration tests for the server routes players use: public quizzes, access codes, attempts (start,
// resume, autosave, submit), the leaderboard and "my attempts". They run the real route handlers against
// the Firestore emulator:
//   npx firebase emulators:exec --only firestore --project demo-ageno-attempts "npx vitest run __tests__/attempts-api.test.ts"
// Without FIRESTORE_EMULATOR_HOST they are skipped.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/firebase/admin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-ageno-attempts" });
  return {
    db: getFirestore(app),
    // A token is "uid:<id>" here; anything else fails to verify.
    auth: {
      verifyIdToken: async (token: string) => {
        if (token.startsWith("uid:")) return { uid: token.slice(4) };
        throw new Error("invalid token");
      },
    },
  };
});

import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { GET as getAttemptRoute, PATCH as patchRoute } from "@/app/api/attempts/[id]/route";
import { GET as resultRoute } from "@/app/api/attempts/[id]/result/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { POST as startRoute } from "@/app/api/attempts/start/route";
import { GET as leaderboardRoute } from "@/app/api/leaderboard/route";
import { GET as myAttemptsRoute } from "@/app/api/my-attempts/route";
import { GET as quizRoute } from "@/app/api/quizzes/[quizId]/route";
import { POST as resolveRoute } from "@/app/api/quizzes/resolve/route";
import { GET as listRoute } from "@/app/api/quizzes/route";
import {
  SUBMIT_GRACE_MS,
  getAttempt,
  saveProgress,
  startAttempt,
  submitAttempt,
} from "@/lib/server/attempts";
import type { AttemptState, SubmitResult } from "@/lib/exam/types";

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
// The first call pays for connecting to the emulator, which can take longer than the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const option = (text: string, isCorrect: boolean) => ({ id: text, text, isCorrect });
const QUESTIONS: Record<string, Record<string, unknown>> = {
  q1: {
    text: "One",
    options: [option("a", false), option("b", true), option("c", false)],
    points: 1,
    explanation: "B is right.",
  },
  q2: { text: "Two", options: [option("a", true), option("b", false)], points: 1 },
  q3: {
    // Older shape: bare strings and a correctIndex.
    text: "Three",
    options: ["x", "y", "z"],
    correctIndex: 2,
    points: 1,
    imageUrl: "https://example.com/three.png",
  },
};

let counter = 0;
const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

async function seedQuiz(
  quiz: Record<string, unknown> = {},
  { level = "medium", questions = QUESTIONS, legacy = false } = {}
) {
  const id = unique("quiz");
  await db.collection("quizzes").doc(id).set({
    title: "Sample",
    description: "",
    isAutoCheck: true,
    isPublic: true,
    requiresAccessCode: false,
    duration: 10,
    accessCode: unique("CODE").toUpperCase(),
    availableDifficulties: ["easy", "medium", "hard"],
    difficultySettings: { hard: { duration: 5, pointsMultiplier: 1.5 } },
    createdAt: Timestamp.now(),
    ...quiz,
  });
  const collection = legacy ? "questions" : `questions_${level}`;
  for (const [qid, data] of Object.entries(questions)) {
    await db.doc(`quizzes/${id}/${collection}/${qid}`).set(data);
  }
  return id;
}

const request = (url: string, method: string, user?: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { authorization: `Bearer uid:${user}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const start = (body: unknown, user?: string) =>
  startRoute(request("/api/attempts/start", "POST", user, body));
const startOk = async (quizId: string, difficulty = "medium", user = "alice") => {
  const response = await start({ quizId, difficulty }, user);
  expect(response.status).toBe(201);
  return (await response.json()) as AttemptState;
};
const submit = (id: string, body: unknown, user?: string) =>
  submitRoute(request(`/api/attempts/${id}/submit`, "POST", user, body), ctx(id));
const patch = (id: string, body: unknown, user?: string) =>
  patchRoute(request(`/api/attempts/${id}`, "PATCH", user, body), ctx(id));
const get = (id: string, user?: string) =>
  getAttemptRoute(request(`/api/attempts/${id}`, "GET", user), ctx(id));

const errorCode = async (response: Response) => (await response.json()).error;
const ev = (seq: number, type: string, at = 1_000) => ({ seq, type, at });

describe.skipIf(!emulator)("public quiz routes", () => {
  it("lists switched-on, visible quizzes and never includes an access code or the owner", async () => {
    const open = await seedQuiz({ title: "Listed", accessCode: "LISTED1", createdBy: "owner-secret-id" });
    const off = await seedQuiz({ title: "Switched off", active: false });
    const hidden = await seedQuiz({ title: "Hidden", isPublic: false });

    const response = await listRoute();
    const text = await response.text();
    const ids = (JSON.parse(text).quizzes as { id: string }[]).map((q) => q.id);

    expect(response.status).toBe(200);
    expect(ids).toContain(open);
    expect(ids).not.toContain(off);
    expect(ids).not.toContain(hidden);
    // (`requiresAccessCode` is fine: it says a code is needed, not what it is.)
    for (const secret of ['"accessCode"', "LISTED1", "owner-secret-id", "createdBy", "isAutoCheck", "orrect"]) {
      expect(text).not.toContain(secret);
    }
    expect(response.headers.get("cache-control")).toContain("s-maxage");
  });

  it("describes what a quiz needs: code required, levels, timing", async () => {
    const id = await seedQuiz({ requiresAccessCode: true, examMode: "strict" });
    const { quizzes } = await (await listRoute()).json();
    expect(quizzes.find((q: { id: string }) => q.id === id)).toMatchObject({
      id,
      title: "Sample",
      requiresAccessCode: true,
      examMode: "strict",
      duration: 10,
      availableDifficulties: ["easy", "medium", "hard"],
      difficultySettings: { hard: { duration: 5, pointsMultiplier: 1.5 } },
    });
  });

  it("returns one quiz with its question counts and no question content or code", async () => {
    const id = await seedQuiz({ accessCode: "ONE1X" }, { level: "easy" });
    await db.doc(`quizzes/${id}/questions_hard/h1`).set(QUESTIONS.q1);
    const response = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: id }) });
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.counts).toEqual({ easy: 3, medium: 0, hard: 1 });
    expect(body.active).toBe(true);
    expect(body.quiz.id).toBe(id);
    for (const secret of ["One", "ONE1X", '"accessCode"', "orrect"]) {
      expect(text).not.toContain(secret);
    }
    expect(response.headers.get("cache-control")).toContain("s-maxage");
  });

  it("falls back to the legacy collection for levels with no questions, like the exam does", async () => {
    const id = await seedQuiz({}, { legacy: true });
    const response = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: id }) });
    expect((await response.json()).counts).toEqual({ easy: 3, medium: 3, hard: 3 });
  });

  it("says when a quiz is switched off, 404s for an unknown one and rejects odd ids", async () => {
    const off = await seedQuiz({ active: false });
    const info = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: off }) });
    expect((await info.json()).active).toBe(false);

    const missing = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "nope" }) });
    expect(missing.status).toBe(404);
    const odd = await quizRoute(request("/x", "GET"), { params: Promise.resolve({ quizId: "a/b" }) });
    expect(odd.status).toBe(400);
  });

  it("turns an access code into the quiz it belongs to, however it is typed", async () => {
    const id = await seedQuiz({ accessCode: "RESOLVE7" });
    for (const typed of ["RESOLVE7", "resolve7", " Resolve7 "]) {
      const response = await resolveRoute(request("/api/quizzes/resolve", "POST", undefined, { code: typed }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ quizId: id });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers 404 for a code nobody has and 400 for an empty one", async () => {
    const none = await resolveRoute(request("/x", "POST", undefined, { code: "NOSUCHCODE" }));
    expect(none.status).toBe(404);
    for (const code of ["", "   ", undefined, 42, "x".repeat(100)]) {
      const bad = await resolveRoute(request("/x", "POST", undefined, { code }));
      expect(bad.status).toBe(400);
    }
  });
});

describe.skipIf(!emulator)("starting an attempt", () => {
  it("returns the questions without any answer key, with the clock fixed on the server", async () => {
    const quizId = await seedQuiz();
    const before = Date.now();
    const response = await start({ quizId, difficulty: "medium" }, "alice");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;

    expect(response.status).toBe(201);
    expect(raw).not.toMatch(/correctIndex|isCorrect|explanation|B is right/);
    expect(state.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(state.questions[0]).toEqual({ id: "q1", text: "One", options: ["a", "b", "c"] });
    expect(state.questions[2].options).toEqual(["x", "y", "z"]);
    expect(state.questions[2].imageUrl).toBe("https://example.com/three.png");
    expect(state.durationSec).toBe(600); // the quiz's own 10 minutes for "medium"
    expect(state.deadline - state.startedAt).toBe(600_000);
    expect(state.startedAt).toBeGreaterThanOrEqual(before - 1);
    expect(Math.abs(state.serverNow - Date.now())).toBeLessThan(5_000);
    expect(state.answers).toEqual({ q1: null, q2: null, q3: null });
    expect(state).toMatchObject({ tabSwitches: 0, blurs: 0, fullscreenExits: 0, eventSeq: 0 });
  });

  it("uses the level's own duration", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    expect((await startOk(quizId, "hard")).durationSec).toBe(300);
  });

  it("needs a signed-in user: no token is a 401, and so is a bad one", async () => {
    const quizId = await seedQuiz();
    const none = await start({ quizId, difficulty: "medium" });
    expect(none.status).toBe(401);
    expect(await errorCode(none)).toBe("sign_in_required");

    const bad = await startRoute(
      new Request("http://localhost/api/attempts/start", {
        method: "POST",
        headers: { authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ quizId, difficulty: "medium" }),
      })
    );
    expect(bad.status).toBe(401);
    expect(await errorCode(bad)).toBe("invalid_token");
  });

  it("checks the access code on the server, however it is typed", async () => {
    const quizId = await seedQuiz({ requiresAccessCode: true, accessCode: "SECRET42" });

    const missing = await start({ quizId, difficulty: "medium" }, "alice");
    expect(missing.status).toBe(403);
    expect(await errorCode(missing)).toBe("access_code_required");

    const wrong = await start({ quizId, difficulty: "medium", accessCode: "NOPE" }, "alice");
    expect(wrong.status).toBe(403);
    expect(await errorCode(wrong)).toBe("access_code_invalid");
    const wrongType = await start({ quizId, difficulty: "medium", accessCode: 42 }, "alice");
    expect(wrongType.status).toBe(403);

    for (const typed of ["SECRET42", "secret42", "  Secret42 "]) {
      const ok = await start({ quizId, difficulty: "medium", accessCode: typed }, "alice");
      expect(ok.status).toBe(201);
    }
  });

  it("doesn't ask for a code when the quiz is open, or says so but has no code to match", async () => {
    const open = await seedQuiz({ requiresAccessCode: false });
    expect((await start({ quizId: open, difficulty: "medium" }, "alice")).status).toBe(201);
    const noCode = await seedQuiz({ requiresAccessCode: true, accessCode: "" });
    expect((await start({ quizId: noCode, difficulty: "medium" }, "alice")).status).toBe(201);
  });

  it("rejects a missing quiz, an inactive one, an empty level, a bad level and a bad body", async () => {
    expect((await start({ quizId: "doesnotexist", difficulty: "medium" }, "alice")).status).toBe(404);

    const inactive = await seedQuiz({ active: false });
    const closed = await start({ quizId: inactive, difficulty: "medium" }, "alice");
    expect(closed.status).toBe(403);
    expect(await errorCode(closed)).toBe("quiz_inactive");

    const quizId = await seedQuiz();
    const empty = await start({ quizId, difficulty: "easy" }, "alice");
    expect(empty.status).toBe(422);
    expect(await errorCode(empty)).toBe("no_questions");

    expect((await start({ quizId, difficulty: "../x" }, "alice")).status).toBe(400);
    expect((await start({ quizId, difficulty: "extreme" }, "alice")).status).toBe(400);
    expect((await start({ quizId: "a/b", difficulty: "medium" }, "alice")).status).toBe(400);
    expect((await start({}, "alice")).status).toBe(400);
    const notJson = await startRoute(
      new Request("http://localhost/api/attempts/start", {
        method: "POST",
        headers: { authorization: "Bearer uid:alice" },
        body: "nope",
      })
    );
    expect(notJson.status).toBe(400);
  });

  it("closes the person's earlier unfinished attempt at the same quiz", async () => {
    const quizId = await seedQuiz();
    const first = await startOk(quizId, "medium", "carol");
    const second = await startOk(quizId, "medium", "carol");
    expect(second.attemptId).not.toBe(first.attemptId);

    expect((await get(first.attemptId, "carol")).status).toBe(409);
    expect((await get(second.attemptId, "carol")).status).toBe(200);
    const other = await startOk(quizId, "medium", "dave");
    expect((await get(other.attemptId, "dave")).status).toBe(200);
  });
});

describe.skipIf(!emulator)("resuming and autosave", () => {
  it("returns the saved answers, flags and position, still without the key", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    const saved = await patch(
      attemptId,
      {
        answers: { q1: 1, q2: null, q3: 0 },
        flagged: { q3: true },
        index: 2,
        events: [ev(1, "tab_hidden"), ev(2, "tab_hidden"), ev(3, "window_blur")],
      },
      "erin"
    );
    expect(saved.status).toBe(200);

    const response = await get(attemptId, "erin");
    const raw = await response.text();
    const state = JSON.parse(raw) as AttemptState;
    expect(raw).not.toMatch(/correctIndex|isCorrect/);
    expect(state.answers).toEqual({ q1: 1, q2: null, q3: 0 });
    expect(state.flagged).toEqual({ q3: true });
    expect(state.index).toBe(2);
    expect(state).toMatchObject({ tabSwitches: 2, blurs: 1, fullscreenExits: 0, eventSeq: 3 });
  });

  it("only keeps whole option numbers for the attempt's own questions", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(
      attemptId,
      { answers: { q1: 7, q2: -1, q3: 1.5, other: 0 }, flagged: { other: true, q1: true }, index: 99 },
      "erin"
    );
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state.answers).toEqual({ q1: null, q2: null, q3: null });
    expect(state.flagged).toEqual({ q1: true });
    expect(state.index).toBe(2);
  });

  it("counts from the events it is sent, never from a number the browser claims", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(attemptId, { tabSwitches: 99, fullscreenExits: 99, blurs: 99 }, "erin");
    let state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ tabSwitches: 0, blurs: 0, fullscreenExits: 0 });

    await patch(attemptId, { events: [ev(1, "fullscreen_exit"), ev(2, "fullscreen_exit")] }, "erin");
    state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ fullscreenExits: 2, eventSeq: 2 });
  });

  it("stamps each event with the server's time and ignores one it already has", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "erin");
    await saveProgress(state.attemptId, "erin", { events: [ev(1, "tab_hidden", 123)] }, { now: state.startedAt + 5_000 });
    // A resend (the first response was lost) plus a new one: the repeat doesn't count twice.
    await saveProgress(
      state.attemptId,
      "erin",
      { events: [ev(1, "tab_hidden", 123), ev(2, "window_blur", 456)] },
      { now: state.startedAt + 9_000 }
    );

    const stored = (await db.collection("attempts").doc(state.attemptId).get()).data()!;
    expect(stored.events).toEqual([
      { seq: 1, type: "tab_hidden", at: state.startedAt + 5_000, clientAt: 123 },
      { seq: 2, type: "window_blur", at: state.startedAt + 9_000, clientAt: 456 },
    ]);
    expect(stored).toMatchObject({ tabSwitches: 1, blurs: 1, eventSeq: 2 });
  });

  it("skips malformed and unknown events", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    await patch(
      attemptId,
      { events: [null, "x", ev(1, "teleport"), { seq: "2", type: "tab_hidden" }, ev(3, "tab_hidden")] },
      "erin"
    );
    const state = (await (await get(attemptId, "erin")).json()) as AttemptState;
    expect(state).toMatchObject({ tabSwitches: 1, eventSeq: 3 });
  });

  it("is private to the person who started it", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "erin");
    expect((await get(attemptId, "mallory")).status).toBe(404);
    expect((await patch(attemptId, { answers: { q1: 0 } }, "mallory")).status).toBe(404);
    expect((await get("doesnotexist", "erin")).status).toBe(404);
    expect((await get("a/b", "erin")).status).toBe(400);
    // And all of it needs a sign-in.
    expect((await get(attemptId)).status).toBe(401);
    expect((await patch(attemptId, { answers: {} })).status).toBe(401);
  });

  it("stops saving once the deadline and the grace period have passed", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "erin");
    await expect(
      saveProgress(state.attemptId, "erin", { answers: { q1: 1 } }, { now: state.deadline + SUBMIT_GRACE_MS - 1 })
    ).resolves.toBeUndefined();
    await expect(
      saveProgress(state.attemptId, "erin", { answers: { q1: 2 } }, { now: state.deadline + SUBMIT_GRACE_MS + 1 })
    ).rejects.toMatchObject({ status: 409, code: "time_expired" });
    // The late write didn't land.
    expect((await getAttempt(state.attemptId, "erin")).answers.q1).toBe(1);
  });
});

describe.skipIf(!emulator)("submitting", () => {
  it("scores on the server, writes the response and answers, and reveals the review", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "frank");
    const response = await submit(
      attemptId,
      {
        answers: { q1: 1, q2: 1, q3: null },
        events: [ev(1, "tab_hidden"), ev(2, "tab_hidden"), ev(3, "fullscreen_exit"), ev(4, "window_blur")],
      },
      "frank"
    );
    const result = (await response.json()) as SubmitResult;

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      responseId: attemptId,
      graded: true,
      correct: 1,
      total: 3,
      answered: 2,
      rawPercent: 33,
      score: 33, // medium has no multiplier
      multiplier: 1,
      late: false,
      answers: { q1: 1, q2: 1, q3: null },
      tabSwitches: 2,
      blurs: 1,
      fullscreenExits: 1,
    });
    expect(result.review).toEqual({
      q1: { correctIndex: 1, explanation: "B is right." },
      q2: { correctIndex: 0 },
      q3: { correctIndex: 2 },
    });

    const doc = (await db.collection("responses").doc(attemptId).get()).data()!;
    expect(doc).toMatchObject({
      quizId,
      userId: "frank",
      attemptId,
      score: 33,
      rawPercent: 33,
      correctCount: 1,
      totalQuestions: 3,
      answeredCount: 2,
      pointsMultiplier: 1,
      tabSwitchCount: 2,
      blurCount: 1,
      fullscreenExits: 1,
      selectedDifficulty: "medium",
      late: false,
    });
    expect(doc).not.toHaveProperty("cameraFlags");
    expect(doc.integrityEvents.map((e: { type: string }) => e.type)).toEqual([
      "tab_hidden",
      "tab_hidden",
      "fullscreen_exit",
      "window_blur",
    ]);
    expect(doc.integrityEvents[0].at).toBeGreaterThan(0);
    expect(doc.startedAt.toMillis()).toBeLessThanOrEqual(doc.submittedAt.toMillis());

    const answers = await db.collection(`responses/${attemptId}/answers`).get();
    const byId = Object.fromEntries(answers.docs.map((d) => [d.id, d.data()]));
    expect(Object.keys(byId).sort()).toEqual(["q1", "q2"]);
    expect(byId.q1).toEqual({ questionId: "q1", selectedIndex: 1, isCorrect: true });
    expect(byId.q2).toEqual({ questionId: "q2", selectedIndex: 1, isCorrect: false });
  });

  it("leaves out the integrity fields on a clean attempt", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "clean");
    await submit(attemptId, { answers: { q1: 1 } }, "clean");
    const doc = (await db.collection("responses").doc(attemptId).get()).data()!;
    expect(doc.tabSwitchCount).toBe(0);
    expect(doc).not.toHaveProperty("blurCount");
    expect(doc).not.toHaveProperty("fullscreenExits");
    expect(doc).not.toHaveProperty("integrityEvents");
  });

  it("applies the level's multiplier, capped at 100", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    const { attemptId } = await startOk(quizId, "hard", "gina");
    const result = (await (
      await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 0 } }, "gina")
    ).json()) as SubmitResult;
    expect(result).toMatchObject({ rawPercent: 67, multiplier: 1.5, score: 100 });

    const half = await startOk(quizId, "hard", "gina2");
    const halfResult = (await (
      await submit(half.attemptId, { answers: { q1: 1 } }, "gina2")
    ).json()) as SubmitResult;
    expect(halfResult).toMatchObject({ rawPercent: 33, score: 50 });
  });

  it("ignores anything in the body that isn't an answer or an event (no score or counts from the browser)", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "hank");
    const result = (await (
      await submit(
        attemptId,
        {
          answers: { q1: 0, bogus: 1 },
          score: 100,
          correct: 3,
          userId: "someone-else",
          multiplier: 9,
          tabSwitches: 50,
          fullscreenExits: 50,
        },
        "hank"
      )
    ).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 0, correct: 0, multiplier: 1, tabSwitches: 0, fullscreenExits: 0 });
    expect((await db.collection("responses").doc(attemptId).get()).data()!.userId).toBe("hank");
  });

  it("is exactly once: a second submit returns the stored result and writes nothing more", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "ivy");
    const first = (await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "ivy")).json()) as SubmitResult;
    // A retry (or a tampered resend) with different answers can't change it.
    const again = (await (await submit(attemptId, { answers: { q1: 0, q2: 1, q3: 0 } }, "ivy")).json()) as SubmitResult;
    expect(again).toEqual(first);
    expect(first.score).toBe(100);

    const responses = await db.collection("responses").where("attemptId", "==", attemptId).get();
    expect(responses.size).toBe(1);
    expect(responses.docs[0].data().score).toBe(100);
  });

  it("is exactly once even when two submits race", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "jack");
    const [a, b] = await Promise.all([
      submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "jack"),
      submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "jack"),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    expect((await db.collection("responses").where("attemptId", "==", attemptId).get()).size).toBe(1);
  });

  it("does not read a submit that arrives after the deadline plus grace: the last autosave counts", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "kim");
    await saveProgress(
      state.attemptId,
      "kim",
      { answers: { q1: 1 }, events: [ev(1, "tab_hidden")] },
      { now: state.deadline - 1_000 }
    );

    const result = await submitAttempt(
      state.attemptId,
      "kim",
      { answers: { q1: 1, q2: 0, q3: 2 }, events: [ev(2, "tab_hidden"), ev(3, "tab_hidden")] }, // sent too late
      { now: state.deadline + SUBMIT_GRACE_MS + 1 }
    );
    expect(result.late).toBe(true);
    expect(result.answers).toEqual({ q1: 1, q2: null, q3: null });
    expect(result).toMatchObject({ correct: 1, answered: 1, score: 33, tabSwitches: 1 });
    expect(result.timeTakenSec).toBe(600); // never more than the time allowed
    expect((await db.collection("responses").doc(state.attemptId).get()).data()).toMatchObject({
      late: true,
      tabSwitchCount: 1,
    });
  });

  it("accepts a submit that arrives a little late, inside the grace period", async () => {
    const quizId = await seedQuiz();
    const state = await startAttempt(quizId, "medium", "lee");
    const result = await submitAttempt(
      state.attemptId,
      "lee",
      { answers: { q1: 1, q2: 0, q3: 2 } },
      { now: state.deadline + SUBMIT_GRACE_MS - 1 }
    );
    expect(result).toMatchObject({ late: false, score: 100 });
  });

  it("scores what the attempt started with, even if the quiz is edited meanwhile", async () => {
    const quizId = await seedQuiz({}, { level: "hard" });
    const { attemptId } = await startOk(quizId, "hard", "max");
    await db.doc(`quizzes/${quizId}/questions_hard/q1`).set({
      ...QUESTIONS.q1,
      options: [option("a", true), option("b", false), option("c", false)],
    });
    await db.doc(`quizzes/${quizId}`).update({
      difficultySettings: { hard: { duration: 5, pointsMultiplier: 1 } },
    });
    const result = (await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "max")).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 100, multiplier: 1.5, correct: 3 });
  });

  it("gives no score and no review for a quiz that is checked by hand", async () => {
    const quizId = await seedQuiz({ isAutoCheck: false });
    const { attemptId } = await startOk(quizId, "medium", "nina");
    const result = (await (await submit(attemptId, { answers: { q1: 1 } }, "nina")).json()) as SubmitResult;
    expect(result).toMatchObject({ graded: false, score: null, correct: null, rawPercent: null, review: null, answered: 1 });

    expect((await db.collection("responses").doc(attemptId).get()).data()!.score).toBeNull();
    const answer = (await db.doc(`responses/${attemptId}/answers/q1`).get()).data()!;
    expect(answer.isCorrect).toBeNull();
  });

  it("withholds the review when the quiz owner turned it off, but still scores", async () => {
    const quizId = await seedQuiz({ showAnswerReview: false });
    const { attemptId } = await startOk(quizId, "medium", "omar");
    const raw = await (await submit(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "omar")).text();
    const result = JSON.parse(raw) as SubmitResult;
    expect(result).toMatchObject({ score: 100, review: null });
    expect(raw).not.toContain("B is right");
  });

  it("is private, needs a sign-in, and closed attempts can't be submitted", async () => {
    const quizId = await seedQuiz();
    const first = await startOk(quizId, "medium", "pat");
    expect((await submit(first.attemptId, { answers: {} }, "mallory")).status).toBe(404);
    const anonymous = await submit(first.attemptId, { answers: {} });
    expect(anonymous.status).toBe(401);

    await startOk(quizId, "medium", "pat"); // closes the first one
    const closed = await submit(first.attemptId, { answers: { q1: 1 } }, "pat");
    expect(closed.status).toBe(409);
    expect(await errorCode(closed)).toBe("attempt_closed");
    expect((await db.collection("responses").doc(first.attemptId).get()).exists).toBe(false);
  });

  it("rejects answers that aren't an object", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "quinn");
    const bad = await submit(attemptId, { answers: [1, 2, 3] }, "quinn");
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe("invalid_answers");
    // The attempt is still open after a rejected submit.
    expect((await get(attemptId, "quinn")).status).toBe(200);
  });

  it("falls back to the attempt's saved answers when the submit sends none", async () => {
    const quizId = await seedQuiz();
    const { attemptId } = await startOk(quizId, "medium", "ray");
    await patch(attemptId, { answers: { q1: 1, q2: 0, q3: 2 } }, "ray");
    const result = (await (await submit(attemptId, {}, "ray")).json()) as SubmitResult;
    expect(result).toMatchObject({ score: 100, answered: 3 });
  });
});

describe.skipIf(!emulator)("leaderboard", () => {
  const response = async (quizId: string, userId: string, score: number, extra: Record<string, unknown> = {}) => {
    await db.collection("responses").doc(unique("r")).set({
      quizId,
      userId,
      score,
      selectedDifficulty: "medium",
      startedAt: Timestamp.fromMillis(Date.now() - 120_000),
      submittedAt: Timestamp.now(),
      ...extra,
    });
  };
  const leaderboard = (query: string, user?: string) =>
    leaderboardRoute(request(`/api/leaderboard${query}`, "GET", user));

  it("returns the top results for a quiz with names and titles already looked up", async () => {
    const quizId = await seedQuiz({ title: "Board quiz" });
    const named = unique("named");
    const unnamed = unique("unnamed");
    await db.collection("users").doc(named).set({ displayName: "Nadia", email: "nadia@example.com", role: "user" });
    await db.collection("users").doc(unnamed).set({ email: "private@example.com", role: "user" });
    await response(quizId, named, 90);
    await response(quizId, unnamed, 95);
    await response(quizId, "ghost-user-id", 50);

    const res = await leaderboard(`?quizId=${quizId}`, "alice");
    const text = await res.text();
    const body = JSON.parse(text);

    expect(res.status).toBe(200);
    expect(body.rows.map((r: { score: number }) => r.score)).toEqual([95, 90, 50]);
    expect(body.users[named]).toBe("Nadia");
    expect(body.users[unnamed]).toBe(`User ${unnamed.slice(0, 6)}`);
    expect(body.users["ghost-user-id"]).toBe("User ghost-");
    expect(body.quizzes[quizId]).toBe("Board quiz");
    // Display names only: no email ever leaves the server.
    expect(text).not.toMatch(/example\.com|@/);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("filters by difficulty and by time frame", async () => {
    const quizId = await seedQuiz();
    await response(quizId, "u-easy", 70, { selectedDifficulty: "easy" });
    await response(quizId, "u-hard", 60, { selectedDifficulty: "hard" });
    await response(quizId, "u-old", 99, {
      submittedAt: Timestamp.fromMillis(Date.now() - 60 * 24 * 3600_000),
    });

    const hard = await (await leaderboard(`?quizId=${quizId}&difficulty=hard`, "alice")).json();
    expect(hard.rows.map((r: { userId: string }) => r.userId)).toEqual(["u-hard"]);

    const week = await (await leaderboard(`?quizId=${quizId}&timeFrame=week`, "alice")).json();
    expect(week.rows.map((r: { userId: string }) => r.userId).sort()).toEqual(["u-easy", "u-hard"]);

    const all = await (await leaderboard(`?quizId=${quizId}&timeFrame=all`, "alice")).json();
    expect(all.rows).toHaveLength(3);
  });

  it("lists the quizzes people can pick, for the filter", async () => {
    const quizId = await seedQuiz({ title: "Pickable" });
    const body = await (await leaderboard("", "alice")).json();
    expect(body.quizzes[quizId]).toBe("Pickable");
  });

  it("needs a sign-in and rejects filters it doesn't understand", async () => {
    expect((await leaderboard("")).status).toBe(401);
    expect((await leaderboard("?timeFrame=century", "alice")).status).toBe(400);
    expect((await leaderboard("?quizId=a/b", "alice")).status).toBe(400);
    expect((await leaderboard("?difficulty=../x", "alice")).status).toBe(400);
  });
});

describe.skipIf(!emulator)("my attempts", () => {
  const myAttempts = (user?: string) =>
    myAttemptsRoute(request("/api/my-attempts", "GET", user));

  it("returns only the caller's own attempts, newest first, with quiz titles", async () => {
    const quizA = await seedQuiz({ title: "Quiz A", description: "About A" });
    const quizB = await seedQuiz({ title: "Quiz B" });
    const me = unique("me");
    const add = (quizId: string, userId: string, score: number | null, ago: number) =>
      db.collection("responses").doc(unique("h")).set({
        quizId,
        userId,
        score,
        tabSwitchCount: 2,
        fullscreenExits: 1,
        selectedDifficulty: "hard",
        startedAt: Timestamp.fromMillis(Date.now() - ago - 60_000),
        submittedAt: Timestamp.fromMillis(Date.now() - ago),
      });
    await add(quizA, me, 40, 3_000_000);
    await add(quizB, me, null, 1_000_000);
    await add("missing-quiz", me, 10, 2_000_000);
    await add(quizA, "somebody-else", 100, 500_000);

    const res = await myAttempts(me);
    const { attempts } = await res.json();

    expect(res.status).toBe(200);
    expect(attempts.map((a: { quizTitle: string }) => a.quizTitle)).toEqual([
      "Quiz B",
      "Unknown quiz",
      "Quiz A",
    ]);
    expect(attempts[2]).toMatchObject({
      quizId: quizA,
      quizDescription: "About A",
      score: 40,
      tabSwitchCount: 2,
      fullscreenExits: 1,
      selectedDifficulty: "hard",
    });
    expect(attempts[0].score).toBeNull();
    expect(attempts[0].submittedAt).toBeGreaterThan(attempts[0].startedAt);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("returns an empty list for someone with no attempts, and needs a sign-in", async () => {
    expect((await (await myAttempts(unique("nobody"))).json()).attempts).toEqual([]);
    expect((await myAttempts()).status).toBe(401);
  });

  it("says which results can be opened again: those saved by a submit, not older ones", async () => {
    const quizId = await seedQuiz();
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    expect((await submit(attempt.attemptId, { answers: {} }, me)).status).toBe(200);
    // Written before attempts existed: no `attemptId`.
    await db.collection("responses").doc(unique("old")).set({
      quizId,
      userId: me,
      score: 0,
      startedAt: Timestamp.fromMillis(Date.now() - 600_000),
      submittedAt: Timestamp.fromMillis(Date.now() - 500_000),
    });

    const { attempts } = await (await myAttempts(me)).json();
    expect(attempts).toHaveLength(2);
    expect(attempts.find((a: { id: string }) => a.id === attempt.attemptId).hasResult).toBe(true);
    expect(attempts.filter((a: { hasResult: boolean }) => !a.hasResult)).toHaveLength(1);
  });
});

describe.skipIf(!emulator)("a finished attempt's result", () => {
  const result = (id: string, user?: string) =>
    resultRoute(request(`/api/attempts/${id}/result`, "GET", user), ctx(id));

  it("returns the stored result, the questions as they were and the title, to its owner", async () => {
    const quizId = await seedQuiz({ title: "Reviewable" });
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    const q = attempt.questions[0].id;
    const submitted = (await (await submit(attempt.attemptId, { answers: { [q]: 0 } }, me)).json()) as SubmitResult;

    // Editing the quiz afterwards must not change what the person sees.
    await db.doc(`quizzes/${quizId}`).update({ title: "Renamed" });
    await db.doc(`quizzes/${quizId}/questions_medium/${q}`).update({ text: "Edited later" });

    const response = await result(attempt.attemptId, me);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attemptId: attempt.attemptId,
      quizId,
      quizTitle: "Renamed",
      difficulty: "medium",
      result: submitted,
    });
    expect(body.questions.map((x: { text: string }) => x.text)).toEqual(attempt.questions.map((x) => x.text));
    expect(typeof body.submittedAt).toBe("number");
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("keeps the review off when it was off at submit time, and never adds an answer key", async () => {
    const quizId = await seedQuiz({ showAnswerReview: false });
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);
    await submit(attempt.attemptId, { answers: {} }, me);

    const text = await (await result(attempt.attemptId, me)).text();
    expect(JSON.parse(text).result.review).toBeNull();
    for (const secret of ["isCorrect", "correctIndex", "B is right."]) {
      expect(text).not.toContain(secret);
    }
  });

  it("refuses an attempt that is still running, someone else's, an unknown id, and no sign-in", async () => {
    const quizId = await seedQuiz();
    const me = unique("me");
    const attempt = await startOk(quizId, "medium", me);

    const running = await result(attempt.attemptId, me);
    expect(running.status).toBe(409);
    expect(await errorCode(running)).toBe("attempt_not_finished");

    await submit(attempt.attemptId, { answers: {} }, me);
    expect((await result(attempt.attemptId, unique("other"))).status).toBe(404);
    expect((await result("does-not-exist", me)).status).toBe(404);
    expect((await result("a%2Fb", me)).status).toBe(400);
    expect((await result(attempt.attemptId)).status).toBe(401);
  });
});
